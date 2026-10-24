import { describe, it, expect } from 'vitest';
import { findShippingZone, isServedCity } from './cities';
import { getShippingCost } from './utils';

const zones = [
  { name: 'Côte Est', cities: ['Toamasina', 'Tamatave'], isDefault: false, price: 8_000 },
  { name: 'Autres villes', cities: [], isDefault: true, price: 15_000 },
];

describe('villes et zones de livraison', () => {
  it('reconnaît une ville sans accents ni majuscules', () => {
    expect(isServedCity('tamatave', ['Toamasina', 'Tamatave'])).toBe(true);
    expect(isServedCity('Tana', ['Antananarivo'])).toBe(true);
  });

  it('trouve la zone de la ville, sinon la zone par défaut', () => {
    expect(findShippingZone('Toamasina II', zones)?.name).toBe('Côte Est');
    expect(findShippingZone('Maintirano', zones)?.name).toBe('Autres villes');
  });

  it('calcule les frais de province et de point relais sans seuil de gratuité', () => {
    expect(getShippingCost('standard', 500_000)).toBe(0);
    expect(getShippingCost('province', 500_000, false, { provincePrice: 8_000 })).toBe(8_000);
    expect(getShippingCost('relais', 10_000, false, { relayFee: 1_000 })).toBe(1_000);
    expect(getShippingCost('province', 10_000, true, { provincePrice: 8_000 })).toBe(0);
  });
});
