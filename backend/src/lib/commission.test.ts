import { describe, it, expect, afterEach } from 'vitest';
import {
  MAX_COMMISSION_RATE,
  defaultCommissionRate,
  effectiveCommissionRate,
  isValidCommissionRate,
  payoutEligibleWhere,
  splitOrderAmounts,
} from './commission.js';

const original = process.env.PLATFORM_COMMISSION_RATE;
afterEach(() => {
  if (original === undefined) delete process.env.PLATFORM_COMMISSION_RATE;
  else process.env.PLATFORM_COMMISSION_RATE = original;
});

describe('defaultCommissionRate', () => {
  it('uses 10 % when nothing is configured', () => {
    delete process.env.PLATFORM_COMMISSION_RATE;
    expect(defaultCommissionRate()).toBe(10);
  });

  it('reads PLATFORM_COMMISSION_RATE (comma decimal accepted)', () => {
    process.env.PLATFORM_COMMISSION_RATE = '7,5';
    expect(defaultCommissionRate()).toBe(7.5);
  });

  it.each(['abc', '-3', '80', '   '])('falls back to 10 % for the invalid value %j', (value) => {
    process.env.PLATFORM_COMMISSION_RATE = value;
    expect(defaultCommissionRate()).toBe(10);
  });

  it('accepts 0 % (commission-free period)', () => {
    process.env.PLATFORM_COMMISSION_RATE = '0';
    expect(defaultCommissionRate()).toBe(0);
  });
});

describe('effectiveCommissionRate', () => {
  it("prefers the seller's own rate, including 0 %", () => {
    delete process.env.PLATFORM_COMMISSION_RATE;
    expect(effectiveCommissionRate({ commissionRate: 5 })).toBe(5);
    expect(effectiveCommissionRate({ commissionRate: 0 })).toBe(0);
  });

  it('uses the default when the seller has no rate or an invalid one', () => {
    delete process.env.PLATFORM_COMMISSION_RATE;
    expect(effectiveCommissionRate({ commissionRate: null })).toBe(10);
    expect(effectiveCommissionRate({ commissionRate: 99 })).toBe(10);
    expect(effectiveCommissionRate(null)).toBe(10);
    expect(effectiveCommissionRate(undefined)).toBe(10);
  });
});

describe('isValidCommissionRate', () => {
  it.each([0, 10, 12.5, MAX_COMMISSION_RATE])('accepts %s', (rate) => expect(isValidCommissionRate(rate)).toBe(true));
  it.each([-1, MAX_COMMISSION_RATE + 1, NaN, Infinity, '10', null, undefined])('rejects %s', (rate) =>
    expect(isValidCommissionRate(rate)).toBe(false)
  );
});

describe('splitOrderAmounts', () => {
  it('takes the commission on the subtotal only and gives the shipping to the seller', () => {
    // sous-total 200 000 Ar + livraison 3 000 Ar ; commission 10 % sur 200 000
    expect(splitOrderAmounts({ subtotal: 200_000, total: 203_000 }, 10)).toEqual({
      commissionRate: 10,
      commissionAmount: 20_000,
      sellerAmount: 183_000,
    });
  });

  it('rounds the commission to a whole Ariary', () => {
    const r = splitOrderAmounts({ subtotal: 333_333, total: 333_333 }, 7.5);
    expect(r.commissionAmount).toBe(25_000); // 24 999,975 -> 25 000
    expect(Number.isInteger(r.commissionAmount)).toBe(true);
    expect(r.commissionAmount + r.sellerAmount).toBe(333_333);
  });

  it('never loses or creates money: commission + seller amount = order total', () => {
    for (const [subtotal, shipping, rate] of [[1_234_567, 3_000, 8.25], [45_000, 0, 12], [9_999, 3_000, 33.3]]) {
      const total = subtotal + shipping;
      const r = splitOrderAmounts({ subtotal, total }, rate);
      expect(r.commissionAmount + r.sellerAmount).toBe(total);
    }
  });

  it('charges nothing at 0 %', () => {
    expect(splitOrderAmounts({ subtotal: 100_000, total: 100_000 }, 0).commissionAmount).toBe(0);
  });
});

describe('payoutEligibleWhere', () => {
  it('targets paid, delivered and received orders not yet paid out, with a computed commission', () => {
    expect(payoutEligibleWhere('s1')).toEqual({
      sellerId: 's1',
      paymentStatus: 'paid',
      status: 'delivered',
      receivedAt: { not: null },
      payoutId: null,
      sellerAmount: { not: null },
    });
  });

  it('covers every seller when no seller is given (platform orders excluded)', () => {
    expect(payoutEligibleWhere().sellerId).toEqual({ not: null });
  });
});
