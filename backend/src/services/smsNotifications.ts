import { sendSms, smsEnabled } from '../lib/sms.js';
import { normalizeMalagasyMobile } from '../lib/phone.js';
import { buyerProtectionDays } from '../lib/buyerProtection.js';

// SMS de suivi de commande, en plus des e-mails : beaucoup de clients n'ont pas d'e-mail ou ne le lisent pas.
// Envoyés seulement si les SMS sont configurés (lib/sms.ts), au mobile malgache de l'acheteur, et désactivables
// avec SMS_ORDER_NOTIFICATIONS=false (chaque SMS est facturé par le prestataire).
// Textes sans accents et courts : un SMS de 160 caractères au plus (un SMS accentué n'en contient que 70).

export function orderSmsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SMS_ORDER_NOTIFICATIONS?.trim().toLowerCase() !== 'false' && smsEnabled(env);
}

// « 185 000 Ar » (espaces simples : les espaces insécables de toLocaleString ne passent pas en SMS)
export function smsPrice(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ar`;
}

// « 25/10 a 14h30 », heure de Madagascar (le serveur tourne en UTC)
export function smsDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Indian/Antananarivo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')} a ${get('hour')}h${get('minute')}`;
}

const orderRef = (orderNumbers: string[]) =>
  orderNumbers.length === 1 ? `Commande ${orderNumbers[0]}` : `Commandes ${orderNumbers[0]} (+${orderNumbers.length - 1})`;

// Envoi en tâche de fond : un SMS refusé ne bloque jamais la commande
function notify(phone: string | null | undefined, text: string): void {
  if (!phone || !normalizeMalagasyMobile(phone) || !orderSmsEnabled()) return;
  sendSms(phone, text).catch((err) => console.error('Failed to send order SMS:', err));
}

export function sendOrderPlacedSms(params: {
  phone: string | null | undefined;
  orderNumbers: string[];
  totalAmount: number;
  /** Numéro marchand Mobile Money ; vide pour un paiement en ligne */
  paymentNumber?: string;
  paymentLabel: string;
  expiresAt?: Date | null;
  cashOnDelivery?: boolean;
}): void {
  const { orderNumbers, totalAmount, paymentNumber, paymentLabel, expiresAt, cashOnDelivery } = params;
  if (cashOnDelivery) {
    notify(params.phone, `Tsena Pro : ${orderRef(orderNumbers)} enregistree. ${smsPrice(totalAmount)} a regler en especes a la livraison.`);
    return;
  }
  const pay = paymentNumber ? `Payez ${smsPrice(totalAmount)} par ${paymentLabel} au ${paymentNumber}` : `Total ${smsPrice(totalAmount)}`;
  const deadline = expiresAt ? ` avant le ${smsDateTime(expiresAt)}` : '';
  notify(params.phone, `Tsena Pro : ${orderRef(orderNumbers)} enregistree. ${pay}${deadline}.`);
}

export function sendPaymentReminderSms(params: {
  phone: string | null | undefined;
  orderNumbers: string[];
  totalAmount: number;
  expiresAt: Date;
}): void {
  const { orderNumbers, totalAmount, expiresAt } = params;
  notify(
    params.phone,
    `Tsena Pro : ${orderRef(orderNumbers)} attend votre paiement de ${smsPrice(totalAmount)}. Sans paiement, annulation le ${smsDateTime(expiresAt)}.`
  );
}

export function sendPaymentConfirmedSms(params: { phone: string | null | undefined; orderNumbers: string[]; totalAmount: number }): void {
  notify(
    params.phone,
    `Tsena Pro : paiement de ${smsPrice(params.totalAmount)} recu pour ${orderRef(params.orderNumbers).toLowerCase()}. Merci ! Nous preparons votre commande.`
  );
}

export function sendOrderStatusSms(params: {
  phone: string | null | undefined;
  orderNumber: string;
  status: 'shipped' | 'delivered' | 'cancelled';
  /** Retrait sur place : « prete » au lieu de « expediee » */
  pickup?: boolean;
}): void {
  const { orderNumber, status, pickup } = params;
  const days = buyerProtectionDays();
  const text = {
    shipped: pickup
      ? `Tsena Pro : votre commande ${orderNumber} est prete. Vous pouvez venir la retirer.`
      : `Tsena Pro : votre commande ${orderNumber} a ete expediee. Elle arrive bientot !`,
    // Paiement garanti : l'acheteur peut signaler un problème avant que le vendeur soit payé
    delivered:
      days > 0
        ? `Tsena Pro : commande ${orderNumber} livree. Un probleme ? Signalez-le sous ${days} jours dans votre compte, sinon elle sera confirmee.`
        : `Tsena Pro : votre commande ${orderNumber} a ete livree. Merci pour votre confiance !`,
    cancelled: `Tsena Pro : votre commande ${orderNumber} a ete annulee. Details dans votre compte ou au service client.`,
  }[status];
  notify(params.phone, text);
}

// Paiement garanti : décision sur le problème signalé par l'acheteur
export function sendDisputeResolvedSms(params: {
  phone: string | null | undefined;
  orderNumber: string;
  resolution: 'refund' | 'release';
}): void {
  notify(
    params.phone,
    params.resolution === 'refund'
      ? `Tsena Pro : votre signalement sur la commande ${params.orderNumber} est accepte. Vous allez etre rembourse.`
      : `Tsena Pro : votre signalement sur la commande ${params.orderNumber} a ete examine. Details par e-mail ou au service client.`
  );
}

// Parrainage : bon d'achat offert au parrain
export function sendReferralRewardSms(params: { phone: string | null | undefined; code: string; amount: number; endsAt: Date }): void {
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit' }).format(params.endsAt);
  notify(
    params.phone,
    `Tsena Pro : votre filleul a commande ! ${smsPrice(params.amount)} offerts avec le code ${params.code}, valable jusqu'au ${day}.`
  );
}
