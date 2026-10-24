// Aperçu des prix et des frais côté client. Le montant facturé est toujours recalculé par le backend :
// garder ce fichier aligné avec backend/src/lib/pricing.ts, shipping.ts et wholesale.ts.

import type { CartItem, DeliveryMethod, PriceTier } from './types';

export const FREE_SHIPPING_THRESHOLD = 100000; // Ar
export const SHIPPING_COSTS: Record<DeliveryMethod, number> = {
  standard: 3000,
  express: 5000,
  retrait: 0,
  // Province : tarif de la zone ; point relais : ses frais (voir ShippingRates)
  province: 0,
  relais: 0,
};

/** Tarifs qui dépendent de l'adresse : zone de province et point relais choisis */
export interface ShippingRates {
  provincePrice?: number;
  relayFee?: number;
}

/** Vente en gros uniquement : quantité minimum plancher */
export const MIN_WHOLESALE_QTY = 10;

/** Prix unitaire du palier applicable pour une quantité (le palier au seuil le plus haut atteint) */
export function resolveUnitPrice(
  basePrice: number,
  priceTiers: PriceTier[] | null | undefined,
  quantity: number
): number {
  const applicable = (priceTiers ?? [])
    .filter((tier) => quantity >= tier.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  return applicable ? applicable.unitPrice : basePrice;
}

/**
 * Frais de livraison d'une commande : offerts si un produit est « livraison gratuite » ou pour le retrait ;
 * province au tarif de la zone et point relais à ses frais (sans seuil de gratuité) ; à domicile, offerts
 * au-dessus du seuil, sinon forfait par mode.
 */
export function getShippingCost(
  method: DeliveryMethod,
  subtotal: number,
  hasFreeShippingItem = false,
  rates: ShippingRates = {}
): number {
  if (hasFreeShippingItem || method === 'retrait') return 0;
  if (method === 'province') return rates.provincePrice ?? 0;
  if (method === 'relais') return rates.relayFee ?? 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_COSTS[method] ?? 0;
}

export interface SellerGroup<T> {
  sellerId: string | null;
  sellerName: string | null;
  items: T[];
}

/** Regroupe les lignes par vendeur (null = plateforme) : une commande par vendeur, chacune avec ses frais */
export function groupBySeller<T extends { sellerId?: string | null; sellerName?: string | null }>(
  items: T[]
): SellerGroup<T>[] {
  const groups = new Map<string | null, SellerGroup<T>>();
  for (const item of items) {
    const key = item.sellerId ?? null;
    const group = groups.get(key) ?? { sellerId: key, sellerName: item.sellerName ?? null, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

/**
 * Prix unitaire d'une ligne. Les paliers dégressifs sont réservés aux comptes professionnels approuvés :
 * particuliers et visiteurs paient le prix de base (backend/src/routes/checkout.ts, `isCustomer`).
 */
export const lineUnitPrice = (item: CartItem, tieredPricing: boolean) =>
  tieredPricing ? resolveUnitPrice(item.price, item.priceTiers, item.quantity) : item.price;
export const lineTotal = (item: CartItem, tieredPricing: boolean) => lineUnitPrice(item, tieredPricing) * item.quantity;

export interface CartSummary {
  subtotal: number;
  shipping: number;
  total: number;
  /** Détail par vendeur (une commande chacun) */
  groups: (SellerGroup<CartItem> & { subtotal: number; shipping: number })[];
}

/** Totaux du panier, avec les frais de livraison calculés séparément pour chaque vendeur */
export function summarizeCart(items: CartItem[], method: DeliveryMethod, tieredPricing = false, rates: ShippingRates = {}): CartSummary {
  const groups = groupBySeller(items).map((group) => {
    const subtotal = group.items.reduce((sum, item) => sum + lineTotal(item, tieredPricing), 0);
    const shipping = getShippingCost(method, subtotal, group.items.some((i) => i.freeShipping), rates);
    return { ...group, subtotal, shipping };
  });
  const subtotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  const shipping = groups.reduce((sum, g) => sum + g.shipping, 0);
  return { subtotal, shipping, total: subtotal + shipping, groups };
}

/** Compte payant les prix dégressifs : entreprise approuvée (pas un particulier ni un visiteur) */
export function hasTieredPricing(
  user: { role: string } | null | undefined,
  company: { status: string } | null | undefined
): boolean {
  return !!user && user.role !== 'customer' && company?.status === 'approved';
}

/** Quantité ramenée au minimum de commande du produit (jamais sous 1) */
export function clampToMoq(quantity: number, moq: number): number {
  const floor = Math.max(1, moq || 1);
  return Number.isFinite(quantity) ? Math.max(floor, Math.floor(quantity)) : floor;
}
