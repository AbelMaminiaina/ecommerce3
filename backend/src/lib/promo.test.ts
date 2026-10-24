import { describe, it, expect } from 'vitest';
import { allocateDiscount, computeDiscount, describePromo, normalizeCode, promoError, type PromoContext } from './promo.js';
import { splitOrderAmounts } from './commission.js';

const now = new Date('2026-10-25T10:00:00Z');

const promo = (overrides: Partial<any> = {}) => ({
  kind: 'standard',
  type: 'percent',
  value: 10,
  maxDiscount: null,
  minSubtotal: 0,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usedCount: 0,
  perUserLimit: 1,
  firstOrderOnly: false,
  isActive: true,
  ownerUserId: null,
  ...overrides,
}) as any;

const ctx = (overrides: Partial<PromoContext> = {}): PromoContext => ({
  userId: 'u1',
  itemsSubtotal: 100_000,
  previousOrders: 0,
  userRedemptions: 0,
  alreadyReferred: false,
  now,
  ...overrides,
});

describe('computeDiscount', () => {
  it('calcule un pourcentage plafonné, ou un montant fixe, jamais plus que les articles', () => {
    expect(computeDiscount(promo({ value: 10 }), 185_000)).toBe(18_500);
    expect(computeDiscount(promo({ value: 10, maxDiscount: 15_000 }), 185_000)).toBe(15_000);
    expect(computeDiscount(promo({ type: 'fixed', value: 5_000 }), 185_000)).toBe(5_000);
    expect(computeDiscount(promo({ type: 'fixed', value: 5_000 }), 3_000)).toBe(3_000);
  });
});

describe('promoError', () => {
  it('accepte un code valide', () => {
    expect(promoError(promo(), ctx())).toBeNull();
  });

  it('refuse un code inconnu, désactivé, hors dates ou épuisé', () => {
    expect(promoError(null, ctx())).toMatch(/invalide/);
    expect(promoError(promo({ isActive: false }), ctx())).toMatch(/invalide/);
    expect(promoError(promo({ startsAt: new Date('2026-11-01') }), ctx())).toMatch(/pas encore/);
    expect(promoError(promo({ endsAt: new Date('2026-10-01') }), ctx())).toMatch(/expiré/);
    expect(promoError(promo({ maxUses: 100, usedCount: 100 }), ctx())).toMatch(/entièrement utilisé/);
  });

  it('applique le minimum d’achat, la limite par client et « première commande »', () => {
    expect(promoError(promo({ minSubtotal: 200_000 }), ctx())).toMatch(/200\s000 Ar/);
    expect(promoError(promo(), ctx({ userRedemptions: 1 }))).toMatch(/déjà utilisé/);
    expect(promoError(promo({ firstOrderOnly: true }), ctx({ previousOrders: 2 }))).toMatch(/première commande/);
  });

  it('parrainage : nouveau client connecté, jamais son propre code ni deux parrains', () => {
    const referral = promo({ kind: 'referral', ownerUserId: 'sponsor' });
    expect(promoError(referral, ctx())).toBeNull();
    expect(promoError(referral, ctx({ userId: null }))).toMatch(/Connectez-vous/);
    expect(promoError(referral, ctx({ userId: 'sponsor' }))).toMatch(/propre code/);
    expect(promoError(referral, ctx({ alreadyReferred: true }))).toMatch(/déjà été parrainé/);
    expect(promoError(referral, ctx({ previousOrders: 1 }))).toMatch(/première commande/);
  });

  it('bon d’achat : réservé à son bénéficiaire', () => {
    const reward = promo({ kind: 'reward', type: 'fixed', value: 5_000, ownerUserId: 'u1' });
    expect(promoError(reward, ctx())).toBeNull();
    expect(promoError(reward, ctx({ userId: 'u2' }))).toMatch(/autre client/);
  });
});

describe('allocateDiscount', () => {
  it('répartit au prorata, au centime près (en Ariary entiers)', () => {
    const shares = allocateDiscount(10_001, [60_000, 40_000]);
    expect(shares).toEqual([6_001, 4_000]);
    expect(allocateDiscount(3, [1, 1, 1])).toEqual([1, 1, 1]);
    // Remise supérieure aux articles : bornée au montant des articles
    expect(allocateDiscount(7, [1, 1, 1])).toEqual([1, 1, 1]);
    expect(allocateDiscount(0, [5, 5])).toEqual([0, 0]);
  });

  it('ne dépasse jamais le montant d’une commande', () => {
    const shares = allocateDiscount(1_000, [999, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(shares[1]).toBeLessThanOrEqual(1);
  });
});

describe('remise prise en charge par la plateforme', () => {
  it('le vendeur reçoit la même part qu’sans remise', () => {
    const without = splitOrderAmounts({ subtotal: 100_000, total: 103_000 }, 10);
    const withDiscount = splitOrderAmounts({ subtotal: 100_000, total: 93_000, discountAmount: 10_000 }, 10);
    expect(withDiscount.sellerAmount).toBe(without.sellerAmount);
    expect(withDiscount.commissionAmount).toBe(10_000);
  });
});

describe('affichage', () => {
  it('normalise et décrit un code', () => {
    expect(normalizeCode(' tsena-ab 12 ')).toBe('TSENA-AB12');
    expect(describePromo(promo({ value: 10, maxDiscount: 20_000 }))).toMatch(/^-10 % \(max 20\s000 Ar\)$/);
    expect(describePromo(promo({ type: 'fixed', value: 5_000 }))).toMatch(/^-5\s000 Ar$/);
  });
});
