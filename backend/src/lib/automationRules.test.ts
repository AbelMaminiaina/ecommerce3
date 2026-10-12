import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isLowStock,
  lowStockThreshold,
  paymentReminderAt,
  paymentReminderHoursBefore,
  paymentReminderLeadHours,
  sellerShippingAlertHours,
  shippingDueAt,
} from './automationRules.js';

const KEYS = ['PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY', 'SELLER_SHIPPING_ALERT_HOURS', 'LOW_STOCK_THRESHOLD'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
afterEach(() =>
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])))
);

const H = 60 * 60 * 1000;
const CREATED = new Date('2026-10-01T08:00:00Z');

describe('réglages', () => {
  it('valeurs par défaut', () => {
    expect(paymentReminderHoursBefore()).toBe(12);
    expect(sellerShippingAlertHours()).toBe(48);
    expect(lowStockThreshold()).toBe(5);
  });

  it('accepte 0 (désactivé) et les décimales à virgule, ignore les valeurs invalides', () => {
    process.env.PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY = '0';
    process.env.SELLER_SHIPPING_ALERT_HOURS = '1,5';
    process.env.LOW_STOCK_THRESHOLD = '-3';
    expect(paymentReminderHoursBefore()).toBe(0);
    expect(sellerShippingAlertHours()).toBe(1.5);
    expect(lowStockThreshold()).toBe(5);
  });
});

describe('paymentReminderAt', () => {
  const awaiting = { status: 'pending', paymentStatus: 'awaiting', createdAt: CREATED, updatedAt: CREATED };

  it('N heures avant l’annulation automatique', () => {
    expect(paymentReminderAt(awaiting, 48, 12)).toEqual(new Date(CREATED.getTime() + 36 * H));
  });

  it('au plus tard à mi-délai quand le délai d’annulation est court', () => {
    expect(paymentReminderLeadHours(6, 12)).toBe(3);
    expect(paymentReminderAt(awaiting, 6, 12)).toEqual(new Date(CREATED.getTime() + 3 * H));
  });

  it('paiement refusé : compté depuis le refus (nouveau délai)', () => {
    const refusedAt = new Date(CREATED.getTime() + 20 * H);
    const rejected = { ...awaiting, paymentStatus: 'rejected', updatedAt: refusedAt };
    expect(paymentReminderAt(rejected, 48, 12)).toEqual(new Date(refusedAt.getTime() + 36 * H));
  });

  it('aucun rappel : commande payée, à vérifier, annulée, ou rappel / annulation désactivé', () => {
    expect(paymentReminderAt({ ...awaiting, paymentStatus: 'submitted' }, 48, 12)).toBeNull();
    expect(paymentReminderAt({ ...awaiting, paymentStatus: 'paid' }, 48, 12)).toBeNull();
    expect(paymentReminderAt({ ...awaiting, status: 'cancelled' }, 48, 12)).toBeNull();
    expect(paymentReminderAt(awaiting, 48, 0)).toBeNull();
    expect(paymentReminderAt(awaiting, 0, 12)).toBeNull();
  });
});

describe('shippingDueAt', () => {
  const paidAt = new Date('2026-10-01T10:00:00Z');

  it('délai compté depuis le paiement', () => {
    expect(shippingDueAt({ paidAt, items: [{ availableFrom: null }] }, 48)).toEqual(new Date(paidAt.getTime() + 48 * H));
  });

  it('précommande : délai compté depuis la disponibilité la plus tardive', () => {
    const later = new Date('2026-10-20T00:00:00Z');
    const items = [{ availableFrom: null }, { availableFrom: later }, { availableFrom: new Date('2026-09-01T00:00:00Z') }];
    expect(shippingDueAt({ paidAt, items }, 48)).toEqual(new Date(later.getTime() + 48 * H));
  });

  it('non payée ou alerte désactivée', () => {
    expect(shippingDueAt({ paidAt: null, items: [] }, 48)).toBeNull();
    expect(shippingDueAt({ paidAt, items: [] }, 0)).toBeNull();
  });
});

describe('isLowStock', () => {
  it('sous le seuil général', () => {
    expect(isLowStock({ stockQuantity: 4, moq: 1 }, 5)).toBe(true);
    expect(isLowStock({ stockQuantity: 5, moq: 1 }, 5)).toBe(false);
  });

  it('seuil relevé à la quantité minimum de commande', () => {
    expect(isLowStock({ stockQuantity: 40, moq: 50 }, 5)).toBe(true);
    expect(isLowStock({ stockQuantity: 50, moq: 50 }, 5)).toBe(false);
  });

  it('seuil à 0 : alerte désactivée', () => {
    expect(isLowStock({ stockQuantity: 0, moq: 10 }, 0)).toBe(false);
  });
});
