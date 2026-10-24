import { describe, expect, it } from 'vitest';
import { findShippingZone, isServedCity } from './cities';
import { getShippingCost, summarizeCart } from './pricing';
import type { CartItem } from './types';

const zones = [
  { name: 'Côte Est', cities: ['Toamasina', 'Tamatave'], isDefault: false },
  { name: 'Autres villes', cities: [], isDefault: true },
];

describe('livraison en province et point relais', () => {
  it('reconnaît les villes sans accents ni majuscules, et la capitale sous ses surnoms', () => {
    expect(isServedCity('Tana', ['Antananarivo'])).toBe(true);
    expect(isServedCity('TAMATAVE', ['Toamasina', 'Tamatave'])).toBe(true);
    expect(isServedCity('Toliara', ['Antananarivo'])).toBe(false);
  });

  it('trouve la zone de la ville, sinon la zone par défaut', () => {
    expect(findShippingZone('Toamasina II', zones)?.name).toBe('Côte Est');
    expect(findShippingZone('Maintirano', zones)?.name).toBe('Autres villes');
  });

  it('facture la zone ou le relais par commande, sans seuil de gratuité', () => {
    expect(getShippingCost('province', 500_000, false, { provincePrice: 8_000 })).toBe(8_000);
    expect(getShippingCost('relais', 500_000, false, { relayFee: 1_000 })).toBe(1_000);
    expect(getShippingCost('province', 500_000, true, { provincePrice: 8_000 })).toBe(0);

    const line = (sellerId: string): CartItem => ({
      productId: sellerId, name: 'X', slug: 'x', price: 20_000, quantity: 1, image: '', moq: 1, unit: 'piece', priceTiers: [], sellerId,
    });
    // Deux vendeurs = deux colis = deux fois le tarif de la zone
    expect(summarizeCart([line('a'), line('b')], 'province', false, { provincePrice: 8_000 }).shipping).toBe(16_000);
  });
});
