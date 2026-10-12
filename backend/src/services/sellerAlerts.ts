import prisma from '../lib/prisma.js';
import { isLowStock, lowStockThreshold, sellerShippingAlertHours, shippingDueAt } from '../lib/automationRules.js';
import { siteUrl } from '../lib/siteUrl.js';
import { sendLateShipmentEmail, sendLowStockEmail } from './emailService.js';
import type { RecurringJob } from './jobs.js';

const BATCH_SIZE = 200;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOT_SHIPPED = ['pending', 'confirmed', 'processing'] as const;
const PLATFORM = 'Équipe';

type Seller = { name: string; contactEmail: string } | null;

function groupBySeller<T extends { sellerId: string | null }>(items: T[]): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) groups.set(item.sellerId, [...(groups.get(item.sellerId) ?? []), item]);
  return groups;
}

// Commandes payées qui auraient dû être expédiées : une alerte par vendeur (les commandes de la plateforme
// vont à l'administrateur), plus un récapitulatif de toutes les commandes en retard pour l'administrateur.
// Une commande n'est signalée qu'une fois (réclamée par une mise à jour conditionnelle).
export async function alertLateShipments(now: Date = new Date()): Promise<{ alerted: string[] }> {
  const hours = sellerShippingAlertHours();
  if (hours <= 0) return { alerted: [] };

  const candidates = await prisma.order.findMany({
    where: {
      paymentStatus: 'paid',
      status: { in: [...NOT_SHIPPED] },
      shippingAlertSentAt: null,
      paidAt: { lte: new Date(now.getTime() - hours * HOUR_MS) },
    },
    include: {
      items: { select: { availableFrom: true } },
      seller: { select: { name: true, contactEmail: true } },
    },
    orderBy: { paidAt: 'asc' },
    take: BATCH_SIZE,
  });

  const late: (typeof candidates[number] & { dueAt: Date })[] = [];
  for (const order of candidates) {
    const dueAt = shippingDueAt(order, hours);
    if (!dueAt || dueAt > now) continue; // précommande : le délai court depuis la disponibilité
    const claim = await prisma.order.updateMany({
      where: { id: order.id, shippingAlertSentAt: null, status: { in: [...NOT_SHIPPED] } },
      data: { shippingAlertSentAt: now },
    });
    if (claim.count > 0) late.push({ ...order, dueAt });
  }
  if (late.length === 0) return { alerted: [] };

  const row = (o: (typeof late)[number]) => ({ orderNumber: o.orderNumber, total: o.total, dueAt: o.dueAt });
  for (const [sellerId, orders] of groupBySeller(late)) {
    const seller: Seller = orders[0].seller;
    if (!sellerId || !seller) continue; // commandes de la plateforme : dans le récapitulatif administrateur
    sendLateShipmentEmail({
      recipientName: seller.name,
      contactEmail: seller.contactEmail,
      orders: orders.map(row),
      manageUrl: `${siteUrl()}/vendeur/commandes`,
    }).catch((err) => console.error('Failed to send late shipment email:', err));
  }
  sendLateShipmentEmail({
    recipientName: PLATFORM,
    orders: late.map((o) => ({ ...row(o), sellerName: o.seller?.name })),
    manageUrl: `${siteUrl()}/admin/commandes`,
  }).catch((err) => console.error('Failed to send late shipment email (admin):', err));

  const alerted = late.map((o) => o.orderNumber);
  console.log(`Commandes en retard d'expédition signalées : ${alerted.join(', ')}`);
  return { alerted };
}

// Produits presque épuisés : une alerte par vendeur (produits de la plateforme : à l'administrateur). Un produit
// n'est signalé qu'une fois, puis « réarmé » quand son stock remonte au-dessus du seuil.
export async function alertLowStock(now: Date = new Date()): Promise<{ alerted: string[]; rearmed: number }> {
  const threshold = lowStockThreshold();
  if (threshold <= 0) return { alerted: [], rearmed: 0 };

  const flagged = await prisma.product.findMany({
    where: { lowStockAlertAt: { not: null } },
    select: { id: true, stockQuantity: true, moq: true },
  });
  const restocked = flagged.filter((p) => !isLowStock(p, threshold)).map((p) => p.id);
  if (restocked.length > 0) {
    await prisma.product.updateMany({ where: { id: { in: restocked } }, data: { lowStockAlertAt: null } });
  }

  // Le seuil d'un produit est relevé à sa quantité minimum de commande : les produits à fort minimum sont
  // lus aussi, le filtre exact se fait en mémoire (isLowStock)
  const candidates = await prisma.product.findMany({
    where: {
      lowStockAlertAt: null,
      isActive: true,
      status: 'approved',
      OR: [{ stockQuantity: { lt: threshold } }, { moq: { gt: threshold } }],
      AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] }], // précommande : pas encore en stock
    },
    select: {
      id: true,
      name: true,
      stockQuantity: true,
      moq: true,
      unit: true,
      sellerId: true,
      seller: { select: { name: true, contactEmail: true } },
    },
    orderBy: { stockQuantity: 'asc' },
    take: BATCH_SIZE,
  });

  const low: typeof candidates = [];
  for (const product of candidates) {
    if (!isLowStock(product, threshold)) continue;
    const claim = await prisma.product.updateMany({
      where: { id: product.id, lowStockAlertAt: null },
      data: { lowStockAlertAt: now },
    });
    if (claim.count > 0) low.push(product);
  }

  for (const [sellerId, products] of groupBySeller(low)) {
    const seller: Seller = products[0].seller;
    sendLowStockEmail({
      recipientName: seller?.name ?? PLATFORM,
      contactEmail: sellerId && seller ? seller.contactEmail : undefined,
      products: products.map(({ name, stockQuantity, unit, moq }) => ({ name, stockQuantity, unit, moq })),
      manageUrl: `${siteUrl()}${sellerId ? '/vendeur/produits' : '/admin/stocks'}`,
    }).catch((err) => console.error('Failed to send low stock email:', err));
  }

  const alerted = low.map((p) => p.name);
  if (alerted.length > 0) console.log(`Alertes de stock bas : ${alerted.join(', ')}`);
  return { alerted, rearmed: restocked.length };
}

// Tâches récurrentes (services/jobs.ts) ; null si l'alerte est désactivée (réglage à 0)
export function lateShipmentJob(): RecurringJob | null {
  if (sellerShippingAlertHours() <= 0) {
    console.log('Alerte de retard d’expédition : désactivée');
    return null;
  }
  return { name: 'late-shipment-alert', everyMs: CHECK_INTERVAL_MS, run: () => alertLateShipments() };
}

export function lowStockJob(): RecurringJob | null {
  if (lowStockThreshold() <= 0) {
    console.log('Alerte de stock bas : désactivée');
    return null;
  }
  return { name: 'low-stock-alert', everyMs: CHECK_INTERVAL_MS, run: () => alertLowStock() };
}
