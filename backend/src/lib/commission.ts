import type { Prisma } from '@prisma/client';

// Commission de la plateforme sur les ventes des vendeurs.
//  - Base : le sous-total des produits (pas la livraison).
//  - Le vendeur livre lui-même : il reçoit `total - commission`, donc aussi les frais de livraison.
//  - Les commandes sans vendeur (produits de la plateforme) ne génèrent aucune commission.
//  - Le taux est figé sur la commande au moment de la confirmation du paiement.

export const MAX_COMMISSION_RATE = 50;
const FALLBACK_COMMISSION_RATE = 10;

export function isValidCommissionRate(rate: unknown): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= MAX_COMMISSION_RATE;
}

// Taux par défaut (en %), configurable par PLATFORM_COMMISSION_RATE ; valeur invalide -> 10 %
export function defaultCommissionRate(): number {
  const raw = process.env.PLATFORM_COMMISSION_RATE;
  if (raw === undefined || raw.trim() === '') return FALLBACK_COMMISSION_RATE;
  const parsed = Number(raw.replace(',', '.'));
  return isValidCommissionRate(parsed) ? parsed : FALLBACK_COMMISSION_RATE;
}

// Taux applicable à un vendeur : son taux propre s'il en a un, sinon le taux par défaut
export function effectiveCommissionRate(seller?: { commissionRate: number | null } | null): number {
  return seller && isValidCommissionRate(seller.commissionRate) ? seller.commissionRate : defaultCommissionRate();
}

// Répartition d'une commande de vendeur entre plateforme et vendeur (montants entiers en Ariary)
export function splitOrderAmounts(order: { subtotal: number; total: number }, ratePercent: number) {
  const commissionAmount = Math.round((order.subtotal * ratePercent) / 100);
  return {
    commissionRate: ratePercent,
    commissionAmount,
    sellerAmount: order.total - commissionAmount,
  };
}

// Commandes dont le produit peut être reversé au vendeur : payées, livrées ET reçues (paiement garanti : réception
// confirmée par l'acheteur ou automatiquement, sans litige en cours), commission calculée, pas encore reversées.
export function payoutEligibleWhere(sellerId?: string): Prisma.OrderWhereInput {
  return {
    sellerId: sellerId ?? { not: null },
    paymentStatus: 'paid',
    status: 'delivered',
    receivedAt: { not: null },
    payoutId: null,
    sellerAmount: { not: null },
  };
}
