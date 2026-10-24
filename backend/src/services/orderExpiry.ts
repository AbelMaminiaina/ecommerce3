import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { EXPIRY_CANCEL_REASON, unpaidOrderExpiryHours } from '../lib/orderExpiry.js';
import { sendOrderCancellationEmail } from './emailService.js';
import { sendOrderStatusSms } from './smsNotifications.js';
import type { RecurringJob } from './jobs.js';

const UNPAID = ['awaiting', 'rejected'] as const;
const BATCH_SIZE = 200;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// Annule les commandes non payées dont le délai est dépassé, restitue leur stock et prévient le client.
// Chaque commande est « réclamée » par une mise à jour conditionnelle : si deux exécutions se croisent
// (ou si le client paie au dernier moment), une seule annule et le stock n'est restitué qu'une fois.
export async function expireUnpaidOrders(now: Date = new Date()): Promise<{ cancelled: string[] }> {
  const hours = unpaidOrderExpiryHours();
  if (hours <= 0) return { cancelled: [] };

  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const candidates = await prisma.order.findMany({
    where: {
      status: 'pending',
      OR: [
        { paymentStatus: 'awaiting', createdAt: { lt: cutoff } },
        { paymentStatus: 'rejected', updatedAt: { lt: cutoff } },
      ],
    },
    include: {
      items: { include: { product: { select: { name: true } } } },
      company: { select: { name: true, contactEmail: true, contactPhone: true } },
      user: { select: { firstName: true, lastName: true, email: true, phone: true, verifiedPhone: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  const cancelled: string[] = [];
  let stockRestored = false;

  for (const order of candidates) {
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: 'pending', paymentStatus: { in: [...UNPAID] } },
      data: { status: 'cancelled', cancelReason: EXPIRY_CANCEL_REASON, stockReserved: false },
    });
    if (claim.count === 0) continue; // payée ou déjà traitée entre-temps

    if (order.stockReserved) {
      await Promise.all(
        order.items.map((item) =>
          prisma.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity }, inStock: true },
          })
        )
      );
      stockRestored = true;
    }
    cancelled.push(order.orderNumber);

    sendOrderStatusSms({
      phone: order.company?.contactPhone ?? order.user?.verifiedPhone ?? order.user?.phone ?? order.guestPhone,
      orderNumber: order.orderNumber,
      status: 'cancelled',
    });

    const contactEmail = order.company?.contactEmail ?? order.user?.email ?? order.guestEmail;
    if (contactEmail) {
      const companyName =
        order.company?.name ?? (order.user ? `${order.user.firstName} ${order.user.lastName}` : order.guestName ?? 'Client');
      sendOrderCancellationEmail({
        orderNumber: order.orderNumber,
        companyName,
        contactEmail,
        reason: EXPIRY_CANCEL_REASON,
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          availableFrom: item.availableFrom,
        })),
        total: order.total,
        cancelledAt: now,
      }).catch((err) => console.error('Failed to send expiry cancellation email:', err));
    }
  }

  if (stockRestored) await invalidateProductCache();
  if (cancelled.length > 0) {
    console.log(`Commandes non payées annulées (${hours} h) : ${cancelled.join(', ')}`);
  }
  return { cancelled };
}

// Tâche récurrente (services/jobs.ts) ; null si l'annulation automatique est désactivée
export function orderExpiryJob(): RecurringJob | null {
  if (unpaidOrderExpiryHours() <= 0) {
    console.log('Annulation automatique des commandes non payées : désactivée');
    return null;
  }
  return { name: 'order-expiry', everyMs: CHECK_INTERVAL_MS, run: () => expireUnpaidOrders() };
}
