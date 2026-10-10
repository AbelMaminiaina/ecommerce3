import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('./emailService.js', () => ({
  sendPaymentConfirmedEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { sendPaymentConfirmedEmail } from './emailService.js';
import { createMockStripe } from '../testing/mockStripeServer.js';
import { createMockPaypal } from '../testing/mockPaypalServer.js';
import { getPaymentMethods } from '../lib/payments.js';
import { handleOperatorCallback, initiateAutoPayment, reconcileAttempt, reconcilePendingAttempts } from './mobileMoneyPayments.js';

// Carte bancaire (Stripe Checkout) et PayPal : paiement sur la page du prestataire, mêmes garanties que le Mobile
// Money (vérification auprès du prestataire, recoupement du montant, règlement unique), testées contre leurs faux serveurs.

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const stripeMock = createMockStripe({ secretKey: 'sk_test_mock' });
const paypalMock = createMockPaypal({ clientId: 'test-client', clientSecret: 'test-secret' });
const originalEnv = { ...process.env };

beforeAll(async () => {
  const stripe = await stripeMock.listen();
  const paypal = await paypalMock.listen();
  for (const key of Object.keys(process.env)) {
    if (/^(MVOLA_|ORANGE_MONEY_|AIRTEL_MONEY_|STRIPE_|PAYPAL_|PAYMENT_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    PUBLIC_SITE_URL: 'https://all.example.mg',
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_API_BASE_URL: stripe.url,
    PAYPAL_CLIENT_ID: 'test-client',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_MGA_RATE: '5000',
    PAYPAL_API_BASE_URL: paypal.url,
  });
});
afterAll(async () => {
  await stripeMock.close();
  await paypalMock.close();
  process.env = originalEnv;
});

let attempt: any;
const orderUpdates: any[] = [];
const orderUpdateManys: any[] = [];
let idCounter = 0;

beforeEach(() => {
  mockReset(prismaMock);
  stripeMock.requests.length = 0;
  paypalMock.requests.length = 0;
  vi.mocked(sendPaymentConfirmedEmail).mockClear();
  orderUpdates.length = 0;
  orderUpdateManys.length = 0;
  attempt = undefined;

  prismaMock.paymentAttempt.findUnique.mockImplementation((async () => (attempt ? { ...attempt } : null)) as any);
  prismaMock.paymentAttempt.findFirst.mockImplementation((async ({ where }: any) => {
    if (where.status === 'pending' && where.orderId) return null;
    if (!attempt || (where.provider && attempt.provider !== where.provider)) return null;
    const matches = (where.OR ?? []).some((cond: any) => Object.entries(cond).every(([k, v]) => attempt[k] === v));
    return matches ? { ...attempt } : null;
  }) as any);
  prismaMock.paymentAttempt.findMany.mockResolvedValue([]);
  prismaMock.paymentAttempt.updateMany.mockImplementation((async ({ where, data }: any) => {
    if (attempt && attempt.id === where.id && (!where.status || attempt.status === where.status)) {
      attempt = { ...attempt, ...data };
      return { count: 1 };
    }
    return { count: 0 };
  }) as any);
  prismaMock.paymentAttempt.update.mockImplementation((async ({ data }: any) => {
    attempt = { ...attempt, ...data };
    return { ...attempt };
  }) as any);
  prismaMock.paymentAttempt.create.mockImplementation((async ({ data }: any) => {
    idCounter++;
    attempt = {
      id: `0000000${idCounter}-aaaa-bbbb-cccc-dddddddddddd`,
      serverCorrelationId: null,
      transactionId: null,
      paymentUrl: null,
      notifToken: null,
      providerAmount: null,
      providerCurrency: null,
      providerStatus: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    return { ...attempt };
  }) as any);
  prismaMock.paymentAttempt.count.mockResolvedValue(0);
  prismaMock.order.update.mockImplementation((async (args: any) => {
    orderUpdates.push(args);
    return {};
  }) as any);
  prismaMock.order.updateMany.mockImplementation((async (args: any) => {
    orderUpdateManys.push(args);
    return { count: 1 };
  }) as any);
});

const order = (overrides: Partial<any> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  checkoutGroup: 'g1',
  status: 'pending',
  paymentStatus: 'awaiting',
  total: 100_000,
  subtotal: 100_000,
  sellerId: null,
  stockReserved: true,
  guestName: 'Rakoto Jean',
  guestEmail: 'jean@example.mg',
  guestPhone: '032 11 111 11',
  company: null,
  user: null,
  ...overrides,
});
const groupOf = (method: string) => [
  order({ paymentMethod: method }),
  order({ id: 'o2', orderNumber: 'ORD-2', total: 50_001, subtotal: 50_001, paymentMethod: method }),
];

describe('moyens de paiement proposés', () => {
  it('propose la carte bancaire et PayPal dès que leurs identifiants sont configurés, sans numéro ni paiement manuel', () => {
    const methods = getPaymentMethods();
    expect(methods).toEqual([
      expect.objectContaining({ id: 'stripe', label: 'Carte bancaire', number: '', automatic: true, manual: false }),
      expect.objectContaining({ id: 'paypal', label: 'PayPal', number: '', automatic: true, manual: false }),
    ]);
  });

  it('ne les propose pas sans identifiants', () => {
    const key = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      expect(getPaymentMethods().map((m) => m.id)).toEqual(['paypal']);
    } finally {
      process.env.STRIPE_SECRET_KEY = key;
    }
  });
});

// --------------------------------------------------------------------------------------------------------------------
describe('Carte bancaire (Stripe)', () => {
  const group = groupOf('stripe');
  const anchor = group[0] as any;

  async function started() {
    const { attempt: created } = await initiateAutoPayment({ group: group as any, anchor });
    prismaMock.order.findMany.mockResolvedValue(group as any);
    return created;
  }

  it('crée une session Checkout en Ariary pour le total du panier et renvoie la page de paiement Stripe', async () => {
    const created = await started();

    expect(created).toMatchObject({ provider: 'stripe', amount: 150_001, payerPhone: '', status: 'pending', providerAmount: 150_001, providerCurrency: 'MGA' });
    expect(created.serverCorrelationId).toMatch(/^cs_test_/);
    expect(created.paymentUrl).toContain('/pay/cs_test_');

    const request = stripeMock.requests.find((r) => r.method === 'POST' && r.path === '/v1/checkout/sessions')!;
    expect(request.headers['idempotency-key']).toBe(`checkout-${created.id}`);
    expect(request.body).toMatchObject({
      mode: 'payment',
      client_reference_id: created.id,
      success_url: 'https://all.example.mg/checkout/confirmation?order=ORD-1%2CORD-2&paiement=retour',
      cancel_url: 'https://all.example.mg/checkout/confirmation?order=ORD-1%2CORD-2&paiement=annule',
      line_items: [{ quantity: '1', price_data: { currency: 'mga', unit_amount: '150001' } }],
    });

    const submitted = orderUpdateManys.find((u) => u.data.paymentStatus === 'submitted');
    expect(submitted.data.paymentReference).toMatch(/^STRIPE:/);
  });

  it('reste en attente tant que le client n’a pas payé', async () => {
    const created = await started();
    expect((await reconcileAttempt(created.id))?.status).toBe('pending');
    expect(orderUpdates).toHaveLength(0);
  });

  it('valide le paiement après vérification du paiement Stripe (montant et devise)', async () => {
    const created = await started();
    stripeMock.pay(created.serverCorrelationId!);

    const result = await reconcileAttempt(created.id);

    expect(result?.status).toBe('completed');
    expect(result?.transactionId).toMatch(/^pi_test_/);
    expect(orderUpdates).toHaveLength(2);
    for (const update of orderUpdates) {
      expect(update.data).toMatchObject({ paymentStatus: 'paid', status: 'processing' });
      expect(update.data.paymentReference).toMatch(/^STRIPE:pi_test_/);
    }
    expect(sendPaymentConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it('ne valide PAS quand le montant encaissé diffère du montant demandé', async () => {
    const created = await started();
    stripeMock.pay(created.serverCorrelationId!, 1000);

    const result = await reconcileAttempt(created.id);

    expect(result?.status).toBe('review');
    expect(result?.failureReason).toContain('Montant encaissé 1000 MGA');
    expect(orderUpdates).toHaveLength(0);
  });

  it('remet les commandes à payer quand la session expire', async () => {
    const created = await started();
    stripeMock.expire(created.serverCorrelationId!);

    const result = await reconcileAttempt(created.id);

    expect(result?.status).toBe('failed');
    const revert = orderUpdateManys.find((u) => u.data.paymentStatus === 'awaiting');
    expect(revert.where).toMatchObject({ paymentReference: { startsWith: 'STRIPE:' } });
  });

  it('un webhook ne fait que déclencher la vérification : rien n’est validé tant que Stripe ne dit pas « payé »', async () => {
    const created = await started();
    const forged = { type: 'checkout.session.completed', data: { object: { id: created.serverCorrelationId, payment_status: 'paid' } } };

    expect(await handleOperatorCallback('stripe', forged)).toBe(true);
    expect(attempt.status).toBe('pending');
    expect(orderUpdates).toHaveLength(0);

    stripeMock.pay(created.serverCorrelationId!);
    await handleOperatorCallback('stripe', forged);
    expect(attempt.status).toBe('completed');
  });

  it('ne règle qu’une seule fois quand plusieurs vérifications arrivent en même temps', async () => {
    const created = await started();
    stripeMock.pay(created.serverCorrelationId!);
    await Promise.all([reconcileAttempt(created.id), reconcileAttempt(created.id), reconcileAttempt(created.id)]);
    expect(orderUpdates).toHaveLength(2);
    expect(sendPaymentConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it('Stripe en panne : pas de renvoi vers le paiement manuel (inexistant pour la carte)', async () => {
    stripeMock.failNextSession();
    const error = await initiateAutoPayment({ group: group as any, anchor }).catch((e) => e);
    expect(error.status).toBe(503);
    expect(error.message).toContain('Stripe est momentanément indisponible');
    expect(error.message).not.toContain('référence');
  });
});

// --------------------------------------------------------------------------------------------------------------------
describe('PayPal', () => {
  const group = groupOf('paypal');
  const anchor = group[0] as any;

  async function started() {
    const { attempt: created } = await initiateAutoPayment({ group: group as any, anchor });
    prismaMock.order.findMany.mockResolvedValue(group as any);
    return created;
  }

  it('crée la commande PayPal en euros (taux configuré, arrondi au-dessus) et renvoie la page d’approbation', async () => {
    const created = await started();

    // 150 001 Ar / 5000 = 30,0002 € -> 30,01 €
    expect(created).toMatchObject({ provider: 'paypal', amount: 150_001, providerAmount: 3001, providerCurrency: 'EUR' });
    expect(created.paymentUrl).toContain(`/pay/${created.serverCorrelationId}`);

    const request = paypalMock.requests.find((r) => r.method === 'POST' && r.path === '/v2/checkout/orders')!;
    expect(request.headers['paypal-request-id']).toBe(`order-${created.id}`);
    expect(request.body.purchase_units[0]).toMatchObject({ custom_id: created.id, amount: { currency_code: 'EUR', value: '30.01' } });
    expect(request.body.payment_source.paypal.experience_context).toMatchObject({
      return_url: 'https://all.example.mg/checkout/confirmation?order=ORD-1%2CORD-2&paiement=retour',
      shipping_preference: 'NO_SHIPPING',
    });
  });

  it('n’encaisse rien tant que le client n’a pas approuvé', async () => {
    const created = await started();
    const capturesBefore = paypalMock.captureCount();
    expect((await reconcileAttempt(created.id))?.status).toBe('pending');
    expect(paypalMock.captureCount()).toBe(capturesBefore);
  });

  it('encaisse (capture) la commande approuvée puis valide après vérification de l’encaissement', async () => {
    const created = await started();
    paypalMock.approve(created.serverCorrelationId!);

    const capturesBefore = paypalMock.captureCount();
    const result = await reconcileAttempt(created.id);

    expect(paypalMock.captureCount()).toBe(capturesBefore + 1);
    expect(result?.status).toBe('completed');
    expect(orderUpdates).toHaveLength(2);
    expect(orderUpdates[0].data.paymentReference).toBe(`PAYPAL:${result?.transactionId}`);
    const capture = paypalMock.requests.find((r) => r.path.endsWith('/capture'))!;
    expect(capture.headers['paypal-request-id']).toBe(`capture-${created.serverCorrelationId}`);
  });

  it('ne capture qu’une fois quand plusieurs vérifications arrivent en même temps', async () => {
    const created = await started();
    paypalMock.approve(created.serverCorrelationId!);
    await Promise.all([reconcileAttempt(created.id), reconcileAttempt(created.id), reconcileAttempt(created.id)]);
    expect(orderUpdates).toHaveLength(2);
    expect(sendPaymentConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it('ne valide PAS quand le montant encaissé diffère du montant demandé', async () => {
    const created = await started();
    paypalMock.approve(created.serverCorrelationId!);
    paypalMock.captureNextWithValue('1.00');

    const result = await reconcileAttempt(created.id);

    expect(result?.status).toBe('review');
    expect(result?.failureReason).toContain('Montant encaissé 1.00 EUR');
    expect(orderUpdates).toHaveLength(0);
  });

  it('échoue proprement quand PayPal refuse le moyen de paiement à la capture', async () => {
    const created = await started();
    paypalMock.approve(created.serverCorrelationId!);
    paypalMock.declineNextCapture();

    const result = await reconcileAttempt(created.id);

    expect(result?.status).toBe('failed');
    expect(orderUpdateManys.find((u) => u.data.paymentStatus === 'awaiting')).toBeTruthy();
  });

  it('n’encaisse JAMAIS une demande déjà abandonnée (approuvée trop tard) : à vérifier par un administrateur', async () => {
    const created = await started();
    const capturesBefore = paypalMock.captureCount();
    paypalMock.approve(created.serverCorrelationId!);
    attempt = { ...attempt, status: 'failed', failureReason: 'Délai de confirmation dépassé (30 min)', updatedAt: new Date() };
    prismaMock.paymentAttempt.findMany.mockImplementation((async ({ where }: any) =>
      where.status === 'failed' ? [{ ...attempt }] : []) as any);

    await reconcilePendingAttempts();

    expect(paypalMock.captureCount()).toBe(capturesBefore);
    expect(attempt.status).toBe('failed'); // approuvée mais non encaissée : rien à vérifier
  });

  it('retrouve la tentative depuis un webhook de capture (qui cite la commande PayPal)', async () => {
    const created = await started();
    const event = { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'X', supplementary_data: { related_ids: { order_id: created.serverCorrelationId } } } };
    expect(await handleOperatorCallback('paypal', event)).toBe(true);
    expect(await handleOperatorCallback('paypal', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: created.serverCorrelationId } })).toBe(false);
  });
});
