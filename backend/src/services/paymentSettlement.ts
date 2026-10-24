import type { Order } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { effectiveCommissionRate, splitOrderAmounts } from '../lib/commission.js';
import { sendPaymentConfirmedEmail } from './emailService.js';
import { sendPaymentConfirmedSms } from './smsNotifications.js';
import { issueReferralReward } from './promo.js';

export type BuyerOrder = Order & {
  company?: { name: string; contactEmail: string; contactPhone?: string | null } | null;
  user?: { firstName: string; lastName: string; email: string | null; phone?: string | null; verifiedPhone?: string | null } | null;
};

export function buyerOf(order: BuyerOrder) {
  return {
    name: order.company?.name ?? (order.user ? `${order.user.firstName} ${order.user.lastName}` : order.guestName ?? 'N/A'),
    email: order.company?.contactEmail ?? order.user?.email ?? order.guestEmail ?? null,
    phone: order.company?.contactPhone ?? order.user?.verifiedPhone ?? order.user?.phone ?? order.guestPhone ?? null,
  };
}

// Passe des commandes en « payées » : commande de vendeur = commission calculée et figée maintenant (taux du
// vendeur, sinon taux par défaut) ; stock déjà réservé = la commande démarre tout de suite. Point unique utilisé
// par la confirmation manuelle d'un administrateur ET par la confirmation automatique de l'API de l'opérateur.
export async function markOrdersPaid(params: {
  orders: Order[];
  /** Commande dont on tire l'identité de l'acheteur pour l'e-mail (avec sa société / son compte) */
  buyerOrder: BuyerOrder;
  /** Champs de paiement à enregistrer en même temps (référence de transaction, numéro du payeur) */
  extra?: { paymentReference?: string; paymentPayerPhone?: string };
}): Promise<void> {
  const { orders, buyerOrder, extra } = params;
  if (orders.length === 0) return;

  const sellerIds = [...new Set(orders.flatMap((o) => (o.sellerId ? [o.sellerId] : [])))];
  const sellerRates = new Map<string, number | null>();
  if (sellerIds.length > 0) {
    const sellers = await prisma.company.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, commissionRate: true },
    });
    for (const s of sellers) sellerRates.set(s.id, s.commissionRate);
  }

  const now = new Date();
  for (const order of orders) {
    const commission = order.sellerId
      ? splitOrderAmounts(order, effectiveCommissionRate({ commissionRate: sellerRates.get(order.sellerId) ?? null }))
      : {};
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'paid',
        paidAt: now,
        paymentRejectionReason: null,
        ...(extra ?? {}),
        ...commission,
        // Stock déjà réservé : la commande peut être préparée immédiatement
        ...(order.status === 'pending' && order.stockReserved ? { status: 'processing' } : {}),
      },
    });
  }

  // Parrainage : première commande du filleul payée -> bon d'achat pour le parrain (une seule fois)
  for (const group of new Set(orders.map((o) => o.checkoutGroup))) {
    await issueReferralReward(group).catch((err) => console.error('Failed to issue referral reward:', err));
  }

  const buyer = buyerOf(buyerOrder);
  sendPaymentConfirmedSms({
    phone: buyer.phone,
    orderNumbers: orders.map((o) => o.orderNumber),
    totalAmount: orders.reduce((sum, o) => sum + o.total, 0),
  });
  if (buyer.email) {
    sendPaymentConfirmedEmail({
      orderNumbers: orders.map((o) => o.orderNumber),
      companyName: buyer.name,
      contactEmail: buyer.email,
      totalAmount: orders.reduce((sum, o) => sum + o.total, 0),
    }).catch((err) => console.error('Failed to send payment confirmation email:', err));
  }
}
