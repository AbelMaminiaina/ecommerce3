import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../services/emailService.js', () => ({
  sendPaymentConfirmedEmail: vi.fn().mockResolvedValue(true),
  sendPaymentRejectedEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('../services/orderExpiry.js', () => ({
  expireUnpaidOrders: vi.fn().mockResolvedValue({ cancelled: ['ORD-1'] }),
}));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { sendPaymentConfirmedEmail, sendPaymentRejectedEmail } from '../services/emailService.js';
import { expireUnpaidOrders } from '../services/orderExpiry.js';
import paymentsRouter from './payments.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

process.env.PAYMENT_MVOLA_NUMBER = '034 00 000 00';
process.env.PAYMENT_ORANGE_MONEY_NUMBER = '032 00 000 00';
delete process.env.PAYMENT_AIRTEL_MONEY_NUMBER;
process.env.PAYMENT_ACCOUNT_NAME = 'Tsena';

const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };
const buyerAuth = { Authorization: `Bearer ${signToken({ userId: 'buyer1', role: 'buyer', companyId: 'c1' })}` };
const otherAuth = { Authorization: `Bearer ${signToken({ userId: 'buyer2', role: 'buyer', companyId: 'c2' })}` };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendPaymentConfirmedEmail).mockClear();
  vi.mocked(sendPaymentRejectedEmail).mockClear();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  return app;
}

const baseOrder = {
  id: 'o1',
  orderNumber: 'ORD-1',
  checkoutGroup: 'g1',
  status: 'pending',
  total: 100000,
  companyId: null,
  userId: null,
  guestName: 'Rakoto Jean',
  guestEmail: 'jean@example.mg',
  guestPhone: '034 11 111 11',
  seller: { name: 'Vendeur 1' },
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
  paymentMethod: 'mvola',
  paymentStatus: 'awaiting',
  paymentReference: null,
  paymentPayerPhone: null,
  paymentSubmittedAt: null,
  paidAt: null,
  paymentRejectionReason: null,
  stockReserved: true,
};
const secondOrder = { ...baseOrder, id: 'o2', orderNumber: 'ORD-2', total: 50000, seller: null };

function mockGroup(overrides: Partial<any> = {}, second: Partial<any> = {}) {
  prismaMock.order.findUnique.mockResolvedValue({ ...baseOrder, ...overrides } as any);
  prismaMock.order.findMany.mockResolvedValue([
    { ...baseOrder, ...overrides },
    { ...secondOrder, ...overrides, id: 'o2', orderNumber: 'ORD-2', total: 50000, ...second },
  ] as any);
}

describe('GET /api/payments/methods', () => {
  it('lists only the methods whose merchant number is configured', async () => {
    const res = await request(buildApp()).get('/api/payments/methods');

    expect(res.status).toBe(200);
    expect(res.body.methods).toEqual([
      { id: 'mvola', label: 'MVola', number: '034 00 000 00', accountName: 'Tsena', automatic: false },
      { id: 'orange_money', label: 'Orange Money', number: '032 00 000 00', accountName: 'Tsena', automatic: false },
    ]);
  });
});

describe('GET /api/payments/status', () => {
  it('returns the group summary for the guest who placed the order', async () => {
    mockGroup();

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=JEAN@example.mg');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      paymentStatus: 'awaiting',
      methodLabel: 'MVola',
      number: '034 00 000 00',
      totalAmount: 150000,
    });
    expect(res.body.orders.map((o: any) => o.orderNumber)).toEqual(['ORD-1', 'ORD-2']);
  });

  it('answers 404 for a wrong e-mail, without revealing that the order exists', async () => {
    mockGroup();

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=autre@example.mg');

    expect(res.status).toBe(404);
  });

  it('allows the owning company but not another one', async () => {
    mockGroup({ guestEmail: null, guestName: null, companyId: 'c1' });

    const owner = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1').set(buyerAuth);
    const other = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1').set(otherAuth);

    expect(owner.status).toBe(200);
    expect(other.status).toBe(404);
  });
});

describe('date limite de paiement', () => {
  it('expose la date limite (création + 48 h) tant que la commande est à payer', async () => {
    delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
    mockGroup();

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.status).toBe(200);
    expect(new Date(res.body.expiresAt)).toEqual(new Date('2026-09-22T10:00:00Z'));
  });

  it('compte le nouveau délai depuis le refus quand le paiement a été refusé', async () => {
    delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
    mockGroup({ paymentStatus: 'rejected', updatedAt: new Date('2026-09-21T15:00:00Z') });

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(new Date(res.body.expiresAt)).toEqual(new Date('2026-09-23T15:00:00Z'));
  });

  it('n’expose plus de date limite quand la référence est à vérifier ou le paiement confirmé', async () => {
    mockGroup({ paymentStatus: 'submitted' });
    const submitted = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    mockGroup({ paymentStatus: 'paid' });
    const paid = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(submitted.body.expiresAt).toBeNull();
    expect(paid.body.expiresAt).toBeNull();
  });

  it('donne le motif quand toutes les commandes ont été annulées faute de paiement', async () => {
    mockGroup({ status: 'cancelled', cancelReason: 'Non payée dans le délai imparti' });

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.cancelReason).toBe('Non payée dans le délai imparti');
    expect(res.body.expiresAt).toBeNull();
  });

  it('n’expose pas de motif d’annulation pour une commande encore active', async () => {
    mockGroup();

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.cancelReason).toBeNull();
  });

  it('n’expose pas de date limite quand l’annulation automatique est désactivée', async () => {
    process.env.UNPAID_ORDER_EXPIRY_HOURS = '0';
    mockGroup();

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.expiresAt).toBeNull();
    delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
  });
});

describe('paiement automatique MVola', () => {
  const configure = () => {
    process.env.MVOLA_CONSUMER_KEY = 'k';
    process.env.MVOLA_CONSUMER_SECRET = 's';
    process.env.MVOLA_MERCHANT_NUMBER = '034 00 000 00';
  };
  const unconfigure = () => {
    delete process.env.MVOLA_CONSUMER_KEY;
    delete process.env.MVOLA_CONSUMER_SECRET;
    delete process.env.MVOLA_MERCHANT_NUMBER;
  };

  it('propose le paiement automatique uniquement quand MVola est configuré', async () => {
    mockGroup();
    const off = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    configure();
    const on = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    const methods = await request(buildApp()).get('/api/payments/methods');
    unconfigure();

    expect(off.body.automatic).toBe(false);
    expect(on.body.automatic).toBe(true);
    expect(methods.body.methods.find((m: any) => m.id === 'mvola').automatic).toBe(true);
    expect(methods.body.methods.find((m: any) => m.id === 'orange_money').automatic).toBe(false);
  });

  it('ne le propose pas pour un autre opérateur ni pour un paiement déjà confirmé', async () => {
    configure();
    mockGroup({ paymentMethod: 'orange_money' });
    const orange = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    mockGroup({ paymentStatus: 'paid' });
    const paid = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    unconfigure();

    expect(orange.body.automatic).toBe(false);
    expect(paid.body.automatic).toBe(false);
  });

  it('expose la dernière tentative (sans les identifiants internes de MVola)', async () => {
    mockGroup({ paymentStatus: 'awaiting' });
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-1', status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur MVola', payerPhone: '0343500003',
      createdAt: new Date('2026-09-20T10:00:00Z'), serverCorrelationId: 'secret', transactionId: 'secret-tx',
    } as any);

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.attempt).toMatchObject({ id: 'att-1', status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur MVola' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('propose Orange Money (redirection) et Airtel Money (téléphone) quand leur API est configurée, avec leur fonctionnement', async () => {
    Object.assign(process.env, {
      ORANGE_MONEY_CLIENT_ID: 'i', ORANGE_MONEY_CLIENT_SECRET: 's', ORANGE_MONEY_MERCHANT_KEY: 'm', PUBLIC_SITE_URL: 'https://all.example.mg',
      AIRTEL_MONEY_CLIENT_ID: 'i', AIRTEL_MONEY_CLIENT_SECRET: 's',
    });
    try {
      mockGroup({ paymentMethod: 'orange_money' });
      const orange = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
      mockGroup({ paymentMethod: 'airtel_money' });
      const airtel = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
      mockGroup({ paymentMethod: 'mvola' });
      const mvola = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

      expect(orange.body).toMatchObject({ automatic: true, instant: { provider: 'orange_money', label: 'Orange Money', flow: 'redirect', phonePrefixes: '032 ou 037' } });
      expect(airtel.body).toMatchObject({ automatic: true, instant: { provider: 'airtel_money', flow: 'push', phonePrefixes: '033' } });
      expect(mvola.body).toMatchObject({ automatic: false, instant: null }); // MVola non configuré ici
    } finally {
      for (const key of ['ORANGE_MONEY_CLIENT_ID', 'ORANGE_MONEY_CLIENT_SECRET', 'ORANGE_MONEY_MERCHANT_KEY', 'PUBLIC_SITE_URL', 'AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET']) {
        delete process.env[key];
      }
    }
  });

  it('expose la page de paiement Orange d’une tentative en cours, sans le pay_token ni le jeton de notification', async () => {
    mockGroup({ paymentMethod: 'orange_money', paymentStatus: 'submitted' });
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-1', provider: 'orange_money', status: 'pending', failureReason: null, payerPhone: '', createdAt: new Date(),
      paymentUrl: 'https://webpayment.orange.example/pay/abc', serverCorrelationId: 'secret-pay-token', notifToken: 'secret-notif',
    } as any);

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.attempt).toMatchObject({ provider: 'orange_money', status: 'pending', paymentUrl: 'https://webpayment.orange.example/pay/abc' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('n’expose plus la page de paiement une fois la tentative échouée', async () => {
    mockGroup({ paymentMethod: 'orange_money' });
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-1', provider: 'orange_money', status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur Orange Money', payerPhone: '',
      createdAt: new Date(), paymentUrl: 'https://webpayment.orange.example/pay/abc',
    } as any);

    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');

    expect(res.body.attempt.paymentUrl).toBeNull();
  });

  it('refuse (409) une référence manuelle pendant un paiement Orange en cours, avec un message adapté à la redirection', async () => {
    mockGroup({ paymentMethod: 'orange_money' });
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-1', provider: 'orange_money' } as any);

    const res = await request(buildApp())
      .post('/api/payments/submit')
      .send({ orderNumber: 'ORD-1', email: 'jean@example.mg', reference: 'MP260920.1234.A56789', payerPhone: '032 11 111 11' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Orange Money est en cours');
    expect(res.body.error).toContain('page de l’opérateur');
  });

  it('signale dans la liste admin un paiement lancé par l’API d’Orange ou d’Airtel', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { ...baseOrder, paymentStatus: 'submitted', paymentReference: 'ORANGE_MONEY:att-1', company: null, user: null, createdAt: new Date() },
      { ...baseOrder, id: 'o2', orderNumber: 'ORD-2', checkoutGroup: 'g2', paymentStatus: 'submitted', paymentReference: 'AIRTEL_MONEY:att-2', company: null, user: null, createdAt: new Date() },
    ] as any);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/payments/admin').set(adminAuth);

    expect(res.body.payments.map((p: any) => p.automatic)).toEqual([true, true]);
  });

  it('n’a aucune tentative pour un paiement purement manuel', async () => {
    mockGroup();
    const res = await request(buildApp()).get('/api/payments/status?orderNumber=ORD-1&email=jean@example.mg');
    expect(res.body.attempt).toBeNull();
  });

  it('refuse (409) une référence manuelle pendant qu’une demande MVola est en cours', async () => {
    mockGroup();
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-1', provider: 'mvola' } as any);

    const res = await request(buildApp())
      .post('/api/payments/submit')
      .send({ orderNumber: 'ORD-1', email: 'jean@example.mg', reference: 'MP260920.1234.A56789', payerPhone: '034 11 111 11' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('MVola est en cours');
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('signale dans la liste admin les paiements lancés par l’API et leur tentative', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { ...baseOrder, paymentStatus: 'submitted', paymentReference: 'MVOLA:att-1', company: null, user: null, createdAt: new Date() },
    ] as any);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([{ orderId: 'o1', status: 'review', failureReason: 'Montant reçu 149000 Ar au lieu de 150000 Ar' }] as any);

    const res = await request(buildApp()).get('/api/payments/admin').set(adminAuth);

    expect(res.body.payments[0]).toMatchObject({
      automatic: true,
      attempt: { status: 'review', failureReason: 'Montant reçu 149000 Ar au lieu de 150000 Ar' },
    });
  });

  it('marque comme manuel un paiement saisi avec une référence', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { ...baseOrder, paymentStatus: 'submitted', paymentReference: 'MP260920.1234.A56789', company: null, user: null, createdAt: new Date() },
    ] as any);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/payments/admin').set(adminAuth);

    expect(res.body.payments[0].automatic).toBe(false);
    expect(res.body.payments[0].attempt).toBeNull();
  });
});

describe('POST /api/payments/admin/expire-unpaid', () => {
  it('lance l’annulation des commandes non payées pour un administrateur', async () => {
    vi.mocked(expireUnpaidOrders).mockClear();

    const res = await request(buildApp()).post('/api/payments/admin/expire-unpaid').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, cancelled: ['ORD-1'] });
    expect(expireUnpaidOrders).toHaveBeenCalledTimes(1);
  });

  it('est refusé à un non-administrateur', async () => {
    vi.mocked(expireUnpaidOrders).mockClear();

    const res = await request(buildApp()).post('/api/payments/admin/expire-unpaid').set(buyerAuth);

    expect(res.status).toBe(403);
    expect(expireUnpaidOrders).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/submit', () => {
  const body = { orderNumber: 'ORD-1', email: 'jean@example.mg', reference: 'MP260920.1234.A56789', payerPhone: '034 11 111 11' };

  it('records the reference on every order of the checkout group', async () => {
    mockGroup();
    prismaMock.order.findFirst.mockResolvedValue(null);
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 } as any);

    const res = await request(buildApp()).post('/api/payments/submit').send(body);

    expect(res.status).toBe(200);
    const args = prismaMock.order.updateMany.mock.calls[0][0] as any;
    expect(args.where.id.in).toEqual(['o1', 'o2']);
    expect(args.data).toMatchObject({
      paymentStatus: 'submitted',
      paymentReference: 'MP260920.1234.A56789',
      paymentPayerPhone: '034 11 111 11',
      paymentRejectionReason: null,
    });
  });

  it('refuses a reference already used by another checkout', async () => {
    mockGroup();
    prismaMock.order.findFirst.mockResolvedValue({ id: 'x' } as any);

    const res = await request(buildApp()).post('/api/payments/submit').send(body);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('déjà utilisée');
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the order is already paid', async () => {
    mockGroup({ paymentStatus: 'paid' });

    const res = await request(buildApp()).post('/api/payments/submit').send(body);

    expect(res.status).toBe(409);
  });

  it('refuses when the order is cancelled', async () => {
    mockGroup({ status: 'cancelled' });

    const res = await request(buildApp()).post('/api/payments/submit').send(body);

    expect(res.status).toBe(400);
  });

  it('allows submitting a new reference after a rejection', async () => {
    mockGroup({ paymentStatus: 'rejected', paymentRejectionReason: 'Montant incorrect' });
    prismaMock.order.findFirst.mockResolvedValue(null);
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 } as any);

    const res = await request(buildApp()).post('/api/payments/submit').send(body);

    expect(res.status).toBe(200);
  });

  it('answers 404 to someone who does not own the order', async () => {
    mockGroup();

    const res = await request(buildApp()).post('/api/payments/submit').send({ ...body, email: 'autre@example.mg' });

    expect(res.status).toBe(404);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['référence trop courte', { reference: 'AB' }],
    ['caractères interdits', { reference: '<script>alert(1)</script>' }],
    ['téléphone manquant', { payerPhone: '' }],
  ])('validates the input (%s)', async (_label, patch) => {
    mockGroup();

    const res = await request(buildApp()).post('/api/payments/submit').send({ ...body, ...patch });

    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('admin payments', () => {
  it('rejects a non-admin user', async () => {
    const res = await request(buildApp()).get('/api/payments/admin').set(buyerAuth);
    expect(res.status).toBe(403);
  });

  it('lists the payments to verify, grouped by checkout', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { ...baseOrder, paymentStatus: 'submitted', paymentReference: 'REF1234', company: null, user: null, createdAt: new Date() },
      { ...secondOrder, paymentStatus: 'submitted', paymentReference: 'REF1234', company: null, user: null, createdAt: new Date() },
    ] as any);

    const res = await request(buildApp()).get('/api/payments/admin').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({
      id: 'o1',
      reference: 'REF1234',
      totalAmount: 150000,
      buyer: { name: 'Rakoto Jean', email: 'jean@example.mg' },
    });
    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where.paymentStatus).toBe('submitted');
  });

  it('confirms the payment: paid orders with reserved stock move to processing', async () => {
    mockGroup({ paymentStatus: 'submitted' }, { stockReserved: false });
    prismaMock.order.update.mockResolvedValue({} as any);

    const res = await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(2);
    const first = prismaMock.order.update.mock.calls[0][0] as any;
    const second = prismaMock.order.update.mock.calls[1][0] as any;
    expect(first.data).toMatchObject({ paymentStatus: 'paid', status: 'processing' });
    // Stock non réservé (rupture) : payée mais reste en attente de stock
    expect(second.data.paymentStatus).toBe('paid');
    expect(second.data.status).toBeUndefined();
    expect(sendPaymentConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumbers: ['ORD-1', 'ORD-2'], contactEmail: 'jean@example.mg', totalAmount: 150000 })
    );
  });

  describe('commission de la plateforme', () => {
    function mockSellerGroup(sellerRate: number | null) {
      const seller = { ...baseOrder, sellerId: 's1', paymentStatus: 'submitted', subtotal: 100_000, total: 103_000 };
      const platform = { ...secondOrder, sellerId: null, paymentStatus: 'submitted', subtotal: 50_000, total: 50_000 };
      prismaMock.order.findUnique.mockResolvedValue(seller as any);
      prismaMock.order.findMany.mockResolvedValue([seller, platform] as any);
      prismaMock.company.findMany.mockResolvedValue([{ id: 's1', commissionRate: sellerRate }] as any);
      prismaMock.order.update.mockResolvedValue({} as any);
    }

    it('fige la commission avec le taux propre du vendeur (sur le sous-total, livraison exclue)', async () => {
      mockSellerGroup(5);

      const res = await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

      expect(res.status).toBe(200);
      const sellerUpdate = prismaMock.order.update.mock.calls[0][0] as any;
      expect(sellerUpdate.data).toMatchObject({ commissionRate: 5, commissionAmount: 5_000, sellerAmount: 98_000 });
      expect((prismaMock.company.findMany.mock.calls[0][0] as any).where).toEqual({ id: { in: ['s1'] } });
    });

    it('utilise le taux par défaut (10 %) quand le vendeur n’a pas de taux propre', async () => {
      delete process.env.PLATFORM_COMMISSION_RATE;
      mockSellerGroup(null);

      await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

      const sellerUpdate = prismaMock.order.update.mock.calls[0][0] as any;
      expect(sellerUpdate.data).toMatchObject({ commissionRate: 10, commissionAmount: 10_000, sellerAmount: 93_000 });
    });

    it('ne prélève aucune commission sur les produits de la plateforme (sans vendeur)', async () => {
      mockSellerGroup(5);

      await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

      const platformUpdate = prismaMock.order.update.mock.calls[1][0] as any;
      expect(platformUpdate.data.paymentStatus).toBe('paid');
      expect(platformUpdate.data).not.toHaveProperty('commissionAmount');
      expect(platformUpdate.data).not.toHaveProperty('sellerAmount');
    });

    it('ne cherche aucun vendeur quand la commande est 100 % plateforme', async () => {
      mockGroup({ paymentStatus: 'submitted' });
      prismaMock.order.update.mockResolvedValue({} as any);

      await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

      expect(prismaMock.company.findMany).not.toHaveBeenCalled();
    });
  });

  it('refuses to confirm a payment that is already confirmed', async () => {
    mockGroup({ paymentStatus: 'paid' });

    const res = await request(buildApp()).patch('/api/payments/admin/o1/confirm').set(adminAuth);

    expect(res.status).toBe(409);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('rejects a payment with a reason and notifies the buyer', async () => {
    mockGroup({ paymentStatus: 'submitted' });
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 } as any);

    const res = await request(buildApp())
      .patch('/api/payments/admin/o1/reject')
      .set(adminAuth)
      .send({ reason: 'Transaction introuvable' });

    expect(res.status).toBe(200);
    const args = prismaMock.order.updateMany.mock.calls[0][0] as any;
    expect(args.data).toEqual({ paymentStatus: 'rejected', paymentRejectionReason: 'Transaction introuvable' });
    expect(sendPaymentRejectedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Transaction introuvable', contactEmail: 'jean@example.mg' })
    );
  });

  it('requires a reason to reject', async () => {
    mockGroup({ paymentStatus: 'submitted' });

    const res = await request(buildApp()).patch('/api/payments/admin/o1/reject').set(adminAuth).send({});

    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).patch('/api/payments/admin/nope/confirm').set(adminAuth);

    expect(res.status).toBe(404);
  });
});
