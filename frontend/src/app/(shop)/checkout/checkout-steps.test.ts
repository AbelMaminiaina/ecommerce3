import { describe, it, expect } from 'vitest';
import { filterCheckoutSteps, type CheckoutStepId } from './checkout-steps';

const steps: { id: CheckoutStepId }[] = [
  { id: 'contact' },
  { id: 'adresse' },
  { id: 'livraison' },
  { id: 'confirmation' },
];

describe('filterCheckoutSteps', () => {
  it('garde adresse, livraison et confirmation pour un client connecté', () => {
    expect(filterCheckoutSteps(steps, false).map((s) => s.id)).toEqual([
      'adresse',
      'livraison',
      'confirmation',
    ]);
  });

  it('ajoute l’étape « coordonnées » en tête pour un visiteur sans compte', () => {
    expect(filterCheckoutSteps(steps, false, true).map((s) => s.id)).toEqual([
      'contact',
      'adresse',
      'livraison',
      'confirmation',
    ]);
  });

  it('cumule visiteur et livraison offerte', () => {
    expect(filterCheckoutSteps(steps, true, true).map((s) => s.id)).toEqual([
      'contact',
      'adresse',
      'confirmation',
    ]);
  });

  it('retire l’étape « livraison » quand le panier a un produit en livraison offerte', () => {
    expect(filterCheckoutSteps(steps, true).map((s) => s.id)).toEqual([
      'adresse',
      'confirmation',
    ]);
  });

  it('ne mute pas le tableau d’origine', () => {
    filterCheckoutSteps(steps, true, true);
    expect(steps).toHaveLength(4);
  });
});
