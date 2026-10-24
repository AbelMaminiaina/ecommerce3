import prisma from '../lib/prisma.js';
import { orderExpiresAt, unpaidOrderExpiryHours } from '../lib/orderExpiry.js';
import { paymentReminderAt, paymentReminderHoursBefore, paymentReminderLeadHours } from '../lib/automationRules.js';
import { siteUrl } from '../lib/siteUrl.js';
import { sendPaymentReminderEmail } from './emailService.js';
import { sendPaymentReminderSms } from './smsNotifications.js';
import { NOT_CASH_ON_DELIVERY } from '../lib/cashOnDelivery.js';
import { buyerOf, type BuyerOrder } from './paymentSettlement.js';
import type { RecurringJob } from './jobs.js';

const BATCH_SIZE = 200;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Rappelle au client, avant l'annulation automatique, qu'une commande attend son paiement. Un panier
// multi-vendeurs (même checkoutGroup) reçoit un seul rappel. Chaque commande est « réclamée » par une mise à
// jour conditionnelle : deux passes simultanées n'envoient jamais deux rappels.
export async function sendPaymentReminders(now: Date = new Date()): Promise<{ reminded: string[] }> {
  const hours = unpaidOrderExpiryHours();
  const before = paymentReminderHoursBefore();
  const lead = paymentReminderLeadHours(hours, before);
  if (lead <= 0) return { reminded: [] };

  const cutoff = new Date(now.getTime() - (hours - lead) * HOUR_MS);
  const candidates = await prisma.order.findMany({
    where: {
      status: 'pending',
      paymentReminderSentAt: null,
      OR: [
        { paymentStatus: 'awaiting', createdAt: { lte: cutoff } },
        { paymentStatus: 'rejected', updatedAt: { lte: cutoff } },
      ],
      AND: [NOT_CASH_ON_DELIVERY],
    },
    include: {
      company: { select: { name: true, contactEmail: true, contactPhone: true } },
      user: { select: { firstName: true, lastName: true, email: true, phone: true, verifiedPhone: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  const groups = new Map<string, BuyerOrder[]>();
  for (const order of candidates) {
    const remindAt = paymentReminderAt(order, hours, before);
    const expiresAt = orderExpiresAt(order, hours);
    // Délai déjà dépassé : l'annulation automatique s'en charge, un rappel arriverait trop tard
    if (!remindAt || !expiresAt || remindAt > now || expiresAt <= now) continue;
    const key = order.checkoutGroup ?? order.id;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }

  const reminded: string[] = [];
  for (const orders of groups.values()) {
    const claim = await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, paymentReminderSentAt: null },
      data: { paymentReminderSentAt: now },
    });
    if (claim.count === 0) continue; // rappel déjà envoyé par une autre passe

    const numbers = orders.map((o) => o.orderNumber);
    reminded.push(...numbers);
    const buyer = buyerOf(orders[0]);
    const expiresAt = new Date(Math.min(...orders.map((o) => orderExpiresAt(o, hours)!.getTime())));
    const totalAmount = orders.reduce((sum, o) => sum + o.total, 0);
    sendPaymentReminderSms({ phone: buyer.phone, orderNumbers: numbers, totalAmount, expiresAt });
    if (!buyer.email) continue;
    sendPaymentReminderEmail({
      orderNumbers: numbers,
      companyName: buyer.name,
      contactEmail: buyer.email,
      totalAmount,
      expiresAt,
      trackingUrl: `${siteUrl()}/suivi-commande?order=${encodeURIComponent(numbers[0])}&email=${encodeURIComponent(buyer.email)}`,
    }).catch((err) => console.error('Failed to send payment reminder email:', err));
  }

  if (reminded.length > 0) console.log(`Rappels de paiement envoyés : ${reminded.join(', ')}`);
  return { reminded };
}

// Tâche récurrente (services/jobs.ts) ; null si le rappel ou l'annulation automatique est désactivé
export function paymentReminderJob(): RecurringJob | null {
  if (paymentReminderLeadHours() <= 0) {
    console.log('Rappel de paiement avant annulation : désactivé');
    return null;
  }
  return { name: 'payment-reminder', everyMs: CHECK_INTERVAL_MS, run: () => sendPaymentReminders() };
}
