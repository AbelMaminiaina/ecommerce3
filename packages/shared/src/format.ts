import type { DeliveryMethod, OrderStatus, PaymentStatus, ProductBadge } from './types';

const priceFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** « 12 500 Ar » */
export function formatPrice(price: number): string {
  return `${priceFormatter.format(price)} Ar`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));
}

// « 90 kg », « 500 pièce(s) » : les unités de poids/volume ne prennent pas de « (s) »
const INVARIABLE_UNITS = new Set(['kg', 'g', 'l', 'L']);
export function formatQuantity(quantity: number, unit: string): string {
  return INVARIABLE_UNITS.has(unit) ? `${quantity} ${unit}` : `${quantity} ${unit}(s)`;
}

/** Produit pas encore disponible (précommande) */
export function isUpcoming(availableFrom?: string | null, now = Date.now()): boolean {
  if (!availableFrom) return false;
  const time = new Date(availableFrom).getTime();
  return !Number.isNaN(time) && time > now;
}

export const BADGE_LABELS: Record<ProductBadge, string> = {
  bio: 'Bio',
  plein_air: 'Plein air',
  nouveau: 'Nouveau',
  promo: 'Promo',
  populaire: 'Populaire',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  awaiting: 'En attente de paiement',
  submitted: 'Paiement à vérifier',
  paid: 'Paiement confirmé',
  rejected: 'Paiement refusé',
};

export const DELIVERY_LABELS: Record<DeliveryMethod, { label: string; delay: string }> = {
  standard: { label: 'Livraison standard', delay: '3 à 5 jours ouvrés' },
  express: { label: 'Livraison express', delay: '1 à 2 jours ouvrés' },
  retrait: { label: 'Retrait sur place', delay: 'Disponible sous 24 h' },
};
