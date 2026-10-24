import { describe, it, expect } from 'vitest';
import { confirmReceiptError, disputeDeadline, openDisputeError, protectionState, type ProtectedOrder } from './buyerProtection.js';
import { cashOnDeliveryError, getCashOnDeliveryConfig, isServedCity } from './cashOnDelivery.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-25T10:00:00Z');

const order = (overrides: Partial<ProtectedOrder & { disputeResolution: string | null }> = {}) => ({
  status: 'delivered',
  paymentStatus: 'paid',
  paymentMethod: 'mvola',
  deliveredAt: new Date(now.getTime() - DAY),
  receivedAt: null,
  disputeOpenedAt: null,
  disputeResolvedAt: null,
  disputeResolution: null,
  payoutId: null,
  ...overrides,
});

describe('paiement garanti', () => {
  it('laisse BUYER_PROTECTION_DAYS jours après la livraison pour signaler un problème', () => {
    expect(disputeDeadline(order(), 3)?.getTime()).toBe(now.getTime() + 2 * DAY);
    expect(openDisputeError(order(), now, 3)).toBeNull();
    expect(openDisputeError(order({ deliveredAt: new Date(now.getTime() - 4 * DAY) }), now, 3)).toMatch(/délai/);
  });

  it('permet de signaler un problème sur une commande en route, pas avant expédition', () => {
    expect(openDisputeError(order({ status: 'shipped', deliveredAt: null }), now, 3)).toBeNull();
    expect(openDisputeError(order({ status: 'processing', deliveredAt: null }), now, 3)).toMatch(/expédiée/);
  });

  it('refuse un second signalement, ou après réception / reversement', () => {
    expect(openDisputeError(order({ disputeOpenedAt: now }), now, 3)).toMatch(/déjà été signalé/);
    expect(openDisputeError(order({ receivedAt: now }), now, 3)).toMatch(/confirmée/);
    expect(openDisputeError(order({ payoutId: 'p1' }), now, 3)).toMatch(/confirmée/);
  });

  it('confirme la réception seulement une fois payée, expédiée et sans litige', () => {
    expect(confirmReceiptError(order())).toBeNull();
    expect(confirmReceiptError(order({ status: 'shipped' }))).toBeNull();
    expect(confirmReceiptError(order({ paymentStatus: 'awaiting', paymentMethod: 'cash_on_delivery' }))).toMatch(/paiement/);
    expect(confirmReceiptError(order({ disputeOpenedAt: now }))).toMatch(/litige/);
    expect(confirmReceiptError(order({ receivedAt: now }))).toMatch(/déjà/);
  });

  it("résume l'état affiché", () => {
    expect(protectionState(order())).toBe('protected');
    expect(protectionState(order({ disputeOpenedAt: now }))).toBe('disputed');
    expect(protectionState(order({ receivedAt: now }))).toBe('received');
    expect(protectionState(order({ disputeOpenedAt: now, disputeResolvedAt: now, disputeResolution: 'refund' }))).toBe('refunded');
    expect(protectionState(order({ paymentStatus: 'awaiting' }))).toBe('none');
  });
});

describe('paiement à la livraison', () => {
  const config = { cities: ['Antananarivo', 'Antsirabe'], maxAmount: 500_000 };

  it("n'est actif qu'avec CASH_ON_DELIVERY=true", () => {
    expect(getCashOnDeliveryConfig({})).toBeNull();
    expect(getCashOnDeliveryConfig({ CASH_ON_DELIVERY: 'true' })).toEqual({ cities: ['Antananarivo'], maxAmount: 500_000 });
  });

  it('reconnaît les écritures courantes de la capitale', () => {
    for (const city of ['Antananarivo', 'antananarivo 101', 'Tana', 'TANANARIVE', 'Antananarivo Renivohitra', 'Antsirabe']) {
      expect(isServedCity(city, config.cities)).toBe(true);
    }
    for (const city of ['Toamasina', 'Mahajanga', '', 'Tanambao']) {
      expect(isServedCity(city, config.cities)).toBe(false);
    }
  });

  it('vérifie compte, ville et montant', () => {
    const ok = { isGuest: false, deliveryMethod: 'standard', city: 'Tana', itemsTotal: 100_000 };
    expect(cashOnDeliveryError(ok, config)).toBeNull();
    expect(cashOnDeliveryError({ ...ok, isGuest: true }, config)).toMatch(/connectés/);
    expect(cashOnDeliveryError({ ...ok, city: 'Toliara' }, config)).toMatch(/Antananarivo, Antsirabe/);
    expect(cashOnDeliveryError({ ...ok, city: null, deliveryMethod: 'retrait' }, config)).toBeNull();
    expect(cashOnDeliveryError({ ...ok, itemsTotal: 600_000 }, config)).toMatch(/limité/);
    expect(cashOnDeliveryError(ok, null)).toMatch(/pas disponible/);
  });
});
