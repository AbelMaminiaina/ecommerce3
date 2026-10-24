// Barème de livraison — source unique de vérité côté backend.
// Le frontend en garde un miroir dans frontend/src/lib/utils.ts (getShippingCost).

export const FREE_SHIPPING_THRESHOLD = 100_000; // Ar — livraison locale (Antananarivo) offerte au-dessus de ce sous-total

export const SHIPPING_COSTS: Record<string, number> = {
  standard: 3_000,
  express: 5_000,
  retrait: 0,
};

interface ShippableItem {
  productId: string;
  quantity: number;
  price: number;
}

/**
 * Frais de livraison en Ariary.
 *
 * Règle 1 — si le panier contient au moins un produit marqué « livraison gratuite »
 *           (freeShippingProductIds), la livraison est offerte : on ignore la méthode,
 *           le seuil, tout le reste.
 * Règle 2 — sinon : retrait gratuit ; province au tarif de la zone ; point relais à ses frais ;
 *           livraison locale gratuite au-dessus du seuil, sinon forfait par méthode.
 */
export function computeShippingCost(
  method: string,
  subtotal: number,
  freeShippingProductIds: Set<string>,
  items: ShippableItem[],
  rates: { provincePrice?: number; relayFee?: number } = {},
): number {
  if (items.some((item) => freeShippingProductIds.has(item.productId))) return 0;
  if (method === 'retrait') return 0;
  if (method === 'province') return rates.provincePrice ?? 0;
  if (method === 'relais') return rates.relayFee ?? 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_COSTS[method] ?? 0;
}
