import { orderExpiresAt, unpaidOrderExpiryHours } from './orderExpiry.js';

// Règles des relances automatiques (logique pure ; les envois sont dans services/paymentReminders.ts et
// services/sellerAlerts.ts). Chaque réglage vaut 0 pour désactiver la relance correspondante.
//
//  - PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY (défaut 12) : rappel au client N heures avant l'annulation automatique
//    d'une commande non payée (au plus tard à mi-délai, pour un délai d'annulation court).
//  - SELLER_SHIPPING_ALERT_HOURS (défaut 48) : commande payée et toujours pas expédiée N heures après le paiement
//    (ou après la date de disponibilité d'un produit en précommande) → alerte au vendeur et à l'administrateur.
//  - LOW_STOCK_THRESHOLD (défaut 5) : stock bas sous ce seuil, ou sous la quantité minimum de commande du produit
//    si elle est plus grande (le produit ne peut alors plus être commandé).

const MAX_HOURS = 24 * 30;

function numberSetting(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return fallback;
  return parsed;
}

export const paymentReminderHoursBefore = (): number => numberSetting('PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY', 12, MAX_HOURS);
export const sellerShippingAlertHours = (): number => numberSetting('SELLER_SHIPPING_ALERT_HOURS', 48, MAX_HOURS);
export const lowStockThreshold = (): number => Math.floor(numberSetting('LOW_STOCK_THRESHOLD', 5, 1_000_000));

const HOUR_MS = 60 * 60 * 1000;

// Avance du rappel sur l'annulation : jamais plus de la moitié du délai de paiement
export function paymentReminderLeadHours(expiryHours = unpaidOrderExpiryHours(), before = paymentReminderHoursBefore()): number {
  if (expiryHours <= 0 || before <= 0) return 0;
  return Math.min(before, expiryHours / 2);
}

interface ExpirableOrder {
  status: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

// Moment où envoyer le rappel de paiement, ou null si la commande n'est pas concernée ou si le rappel est désactivé
export function paymentReminderAt(
  order: ExpirableOrder,
  expiryHours = unpaidOrderExpiryHours(),
  before = paymentReminderHoursBefore()
): Date | null {
  const lead = paymentReminderLeadHours(expiryHours, before);
  const expiresAt = orderExpiresAt(order, expiryHours);
  if (!expiresAt || lead <= 0) return null;
  return new Date(expiresAt.getTime() - lead * HOUR_MS);
}

// Date à laquelle une commande payée aurait dû être expédiée : le délai court depuis le paiement, ou depuis la
// date de disponibilité la plus tardive de ses produits (précommande).
export function shippingDueAt(
  order: { paidAt: Date | null; items: { availableFrom: Date | null }[] },
  hours = sellerShippingAlertHours()
): Date | null {
  if (!order.paidAt || hours <= 0) return null;
  const start = Math.max(order.paidAt.getTime(), ...order.items.map((item) => item.availableFrom?.getTime() ?? 0));
  return new Date(start + hours * HOUR_MS);
}

// Seuil d'alerte d'un produit : le seuil général, relevé à la quantité minimum de commande
export function isLowStock(product: { stockQuantity: number; moq: number }, threshold = lowStockThreshold()): boolean {
  if (threshold <= 0) return false;
  return product.stockQuantity < Math.max(threshold, product.moq);
}
