import { describe, expect, it } from 'vitest';
import { clampToMoq, getShippingCost, hasTieredPricing, resolveUnitPrice, summarizeCart } from './pricing';
import { addCartItem, sanitizeCartItems, setCartQuantity } from './cart';
import { isPayerNumber } from './schemas';
import type { CartItem } from './types';

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1',
  name: 'Riz',
  slug: 'riz',
  price: 1000,
  quantity: 10,
  image: '',
  moq: 10,
  unit: 'kg',
  priceTiers: [
    { minQty: 50, unitPrice: 900 },
    { minQty: 100, unitPrice: 800 },
  ],
  ...over,
});

describe('prix et livraison', () => {
  it('applique le palier au seuil le plus haut atteint', () => {
    const tiers = item().priceTiers;
    expect(resolveUnitPrice(1000, tiers, 49)).toBe(1000);
    expect(resolveUnitPrice(1000, tiers, 50)).toBe(900);
    expect(resolveUnitPrice(1000, tiers, 150)).toBe(800);
  });

  it('offre la livraison au retrait, au-dessus du seuil ou avec un produit « livraison gratuite »', () => {
    expect(getShippingCost('standard', 5000)).toBe(3000);
    expect(getShippingCost('express', 5000)).toBe(5000);
    expect(getShippingCost('retrait', 5000)).toBe(0);
    expect(getShippingCost('standard', 100000)).toBe(0);
    expect(getShippingCost('express', 5000, true)).toBe(0);
  });

  it('calcule les frais séparément pour chaque vendeur', () => {
    const summary = summarizeCart(
      [item(), item({ productId: 'p2', sellerId: 's1', sellerName: 'Vendeur' })],
      'standard'
    );
    expect(summary.groups).toHaveLength(2);
    expect(summary.subtotal).toBe(20000);
    expect(summary.shipping).toBe(6000);
    expect(summary.total).toBe(26000);
  });

  it('réserve les paliers aux entreprises approuvées', () => {
    const items = [item({ quantity: 100 })];
    expect(summarizeCart(items, 'retrait').subtotal).toBe(100000);
    expect(summarizeCart(items, 'retrait', true).subtotal).toBe(80000);
    expect(hasTieredPricing({ role: 'customer' }, null)).toBe(false);
    expect(hasTieredPricing({ role: 'buyer' }, { status: 'pending' })).toBe(false);
    expect(hasTieredPricing({ role: 'company_admin' }, { status: 'approved' })).toBe(true);
    expect(hasTieredPricing(null, null)).toBe(false);
  });

  it('ne descend jamais sous le minimum de commande', () => {
    expect(clampToMoq(3, 10)).toBe(10);
    expect(clampToMoq(12.7, 10)).toBe(12);
    expect(clampToMoq(NaN, 0)).toBe(1);
  });
});

describe('panier', () => {
  it('cumule les quantités et retire une ligne à 0', () => {
    let items = addCartItem([], item());
    items = addCartItem(items, item({ quantity: 5 }));
    expect(items[0].quantity).toBe(15);
    expect(setCartQuantity(items, 'p1', 2)[0].quantity).toBe(10);
    expect(setCartQuantity(items, 'p1', 0)).toEqual([]);
  });

  it('écarte les lignes abîmées relues du stockage', () => {
    expect(sanitizeCartItems('x')).toEqual([]);
    const clean = sanitizeCartItems([{ productId: 'p', name: 'n', slug: 's', price: 1, quantity: 2 }, { name: 'sans id' }]);
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatchObject({ moq: 1, unit: 'pièce', priceTiers: [] });
  });
});

describe('numéros Mobile Money', () => {
  it("reconnaît les préfixes de chaque opérateur", () => {
    expect(isPayerNumber('mvola', '+261 34 12 345 67')).toBe(true);
    expect(isPayerNumber('mvola', '032 12 345 67')).toBe(false);
    expect(isPayerNumber('orange_money', '0321234567')).toBe(true);
    expect(isPayerNumber('airtel_money', '033.12.345.67')).toBe(true);
  });
});
