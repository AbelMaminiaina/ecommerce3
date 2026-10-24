import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../services/emailService.js', () => ({
  sendPayoutPaidEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { sendPayoutPaidEmail } from '../services/emailService.js';
import payoutsRouter from './payouts.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };
const sellerAuth = { Authorization: `Bearer ${signToken({ userId: 'u9', role: 'company_admin', companyId: 's1' })}` };
const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'cust1', role: 'customer', companyId: null })}` };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendPayoutPaidEmail).mockClear();
  delete process.env.PLATFORM_COMMISSION_RATE;
  // $transaction(callback) : exécute le callback sur le même client simulé
  prismaMock.$transaction.mockImplementation((async (fn: any) => fn(prismaMock)) as any);
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payouts', payoutsRouter);
  return app;
}

const approvedSeller = (extra: Partial<any> = {}) =>
  ({
    id: 's1',
    status: 'approved',
    name: 'Vendeur 1',
    contactEmail: 'v1@example.mg',
    commissionRate: null,
    payoutMethod: null,
    payoutNumber: null,
    payoutAccountName: null,
    ...extra,
  }) as any;

describe('accès', () => {
  it.each([
    ['GET', '/api/payouts/admin/summary'],
    ['GET', '/api/payouts/admin/history'],
    ['GET', '/api/payouts/admin/sellers/s1/eligible'],
  ])('%s %s est réservé aux administrateurs', async (_method, url) => {
    const res = await request(buildApp()).get(url).set(sellerAuth);
    expect(res.status).toBe(403);
  });

  it("refuse à un vendeur d'enregistrer un reversement ou de changer un taux", async () => {
    const a = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(sellerAuth).send({});
    const b = await request(buildApp()).patch('/api/payouts/admin/sellers/s1/commission').set(sellerAuth).send({ rate: 0 });
    expect(a.status).toBe(403);
    expect(b.status).toBe(403);
  });

  it('refuse un particulier sur les routes vendeur', async () => {
    const res = await request(buildApp()).get('/api/payouts/seller/summary').set(customerAuth);
    expect(res.status).toBe(403);
  });

  it("refuse une entreprise non approuvée sur les routes vendeur", async () => {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller({ status: 'pending' }));
    const res = await request(buildApp()).get('/api/payouts/seller/summary').set(sellerAuth);
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/summary', () => {
  it('sépare ce qui est à reverser, en cours et déjà versé, par vendeur', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { sellerId: 's1', status: 'delivered', receivedAt: new Date(), payoutId: null, commissionAmount: 10_000, sellerAmount: 93_000 }, // à reverser
      { sellerId: 's1', status: 'shipped', receivedAt: null, payoutId: null, commissionAmount: 5_000, sellerAmount: 46_000 }, // en cours
      { sellerId: 's1', status: 'delivered', receivedAt: new Date(), payoutId: 'p1', commissionAmount: 2_000, sellerAmount: 20_000 }, // déjà versé
      { sellerId: 's2', status: 'delivered', receivedAt: new Date(), payoutId: null, commissionAmount: 0, sellerAmount: 50_000 },
    ] as any);
    prismaMock.payout.findMany.mockResolvedValue([{ sellerId: 's1', amount: 20_000, ordersCount: 1 }] as any);
    prismaMock.company.findMany.mockResolvedValue([
      { id: 's1', name: 'Vendeur 1', contactEmail: 'a@b.mg', commissionRate: 5, payoutMethod: 'mvola', payoutNumber: '034 00 000 00', payoutAccountName: 'V1' },
      { id: 's2', name: 'Vendeur 2', contactEmail: 'c@d.mg', commissionRate: null, payoutMethod: null, payoutNumber: null, payoutAccountName: null },
    ] as any);

    const res = await request(buildApp()).get('/api/payouts/admin/summary').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.defaultRate).toBe(10);
    const [s1, s2] = res.body.sellers;
    expect(s1).toMatchObject({
      id: 's1',
      effectiveRate: 5,
      commissionRate: 5,
      eligible: { count: 1, amount: 93_000, commission: 10_000 },
      pending: { count: 1, amount: 46_000 },
      paidOut: { count: 1, amount: 20_000 },
      commissionEarned: 17_000,
    });
    expect(s2).toMatchObject({ effectiveRate: 10, commissionRate: null, eligible: { count: 1, amount: 50_000 } });
    expect(res.body.totals).toEqual({ toPayOut: 143_000, pending: 46_000, paidOut: 20_000, commissionEarned: 17_000 });
  });

  it('ne compte que les commandes de vendeurs payées et non annulées', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.payout.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await request(buildApp()).get('/api/payouts/admin/summary').set(adminAuth);

    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where).toMatchObject({
      sellerId: { not: null },
      paymentStatus: 'paid',
      status: { not: 'cancelled' },
    });
  });
});

describe('POST /admin/sellers/:sellerId/payouts', () => {
  const body = { method: 'mvola', reference: 'MP260920.9999.X1' };
  const eligible = [
    { id: 'o1', orderNumber: 'ORD-1', commissionAmount: 10_000, sellerAmount: 93_000 },
    { id: 'o2', orderNumber: 'ORD-2', commissionAmount: 5_000, sellerAmount: 46_000 },
  ];

  function mockHappyPath() {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller());
    prismaMock.order.findMany.mockResolvedValue(eligible as any);
    prismaMock.payout.create.mockResolvedValue({ id: 'p1', amount: 139_000, commissionTotal: 15_000 } as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 } as any);
  }

  it('reverse toutes les commandes éligibles : montant, commission, verrouillage et e-mail', async () => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send(body);

    expect(res.status).toBe(201);
    const created = (prismaMock.payout.create.mock.calls[0][0] as any).data;
    expect(created).toMatchObject({
      sellerId: 's1',
      amount: 139_000,
      commissionTotal: 15_000,
      ordersCount: 2,
      method: 'mvola',
      reference: 'MP260920.9999.X1',
      paidByUserId: 'admin1',
    });
    const lock = prismaMock.order.updateMany.mock.calls[0][0] as any;
    expect(lock.where).toEqual({ id: { in: ['o1', 'o2'] }, payoutId: null });
    expect(lock.data).toEqual({ payoutId: 'p1' });
    expect(sendPayoutPaidEmail).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'v1@example.mg', amount: 139_000, methodLabel: 'MVola', orderNumbers: ['ORD-1', 'ORD-2'] })
    );
  });

  it("ne cherche que des commandes éligibles de CE vendeur (payées, livrées, reçues, pas encore reversées)", async () => {
    mockHappyPath();

    await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send(body);

    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where).toEqual({
      sellerId: 's1',
      paymentStatus: 'paid',
      status: 'delivered',
      receivedAt: { not: null },
      payoutId: null,
      sellerAmount: { not: null },
    });
  });

  it('accepte une sélection de commandes', async () => {
    mockHappyPath();
    prismaMock.order.findMany.mockResolvedValue([eligible[0]] as any);
    prismaMock.payout.create.mockResolvedValue({ id: 'p1', amount: 93_000, commissionTotal: 10_000 } as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send({ ...body, orderIds: ['o1'] });

    expect(res.status).toBe(201);
    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where.id).toEqual({ in: ['o1'] });
  });

  it("refuse (409) une sélection contenant une commande qui n'est plus éligible, sans rien enregistrer", async () => {
    mockHappyPath();
    prismaMock.order.findMany.mockResolvedValue([eligible[0]] as any); // o2 déjà reversée / annulée

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send({ ...body, orderIds: ['o1', 'o2'] });

    expect(res.status).toBe(409);
    expect(prismaMock.payout.create).not.toHaveBeenCalled();
    expect(sendPayoutPaidEmail).not.toHaveBeenCalled();
  });

  it('refuse (409) si une commande a été prise par un autre reversement entre-temps (pas de double paiement)', async () => {
    mockHappyPath();
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send(body);

    expect(res.status).toBe(409);
    expect(sendPayoutPaidEmail).not.toHaveBeenCalled();
  });

  it("répond 400 quand il n'y a rien à reverser", async () => {
    mockHappyPath();
    prismaMock.order.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Aucune commande');
    expect(prismaMock.payout.create).not.toHaveBeenCalled();
  });

  it('répond 404 pour un vendeur inconnu', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/nope/payouts').set(adminAuth).send(body);

    expect(res.status).toBe(404);
  });

  it.each([
    ['moyen inconnu', { ...body, method: 'cash' }],
    ['référence manquante', { method: 'mvola' }],
    ['référence trop courte', { ...body, reference: 'ab' }],
    ['liste de commandes vide', { ...body, orderIds: [] }],
  ])('valide la saisie (%s)', async (_label, payload) => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/payouts/admin/sellers/s1/payouts').set(adminAuth).send(payload);

    expect(res.status).toBe(400);
    expect(prismaMock.payout.create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/history', () => {
  it('liste les reversements avec le vendeur et les commandes concernées', async () => {
    prismaMock.payout.findMany.mockResolvedValue([
      {
        id: 'p1', sellerId: 's1', seller: { name: 'Vendeur 1' }, amount: 139_000, commissionTotal: 15_000, ordersCount: 2,
        method: 'mvola', reference: 'REF1', note: null, paidAt: new Date('2026-09-20'), orders: [{ orderNumber: 'ORD-1' }, { orderNumber: 'ORD-2' }],
      },
    ] as any);

    const res = await request(buildApp()).get('/api/payouts/admin/history?sellerId=s1').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.payouts[0]).toMatchObject({ sellerName: 'Vendeur 1', amount: 139_000, orderNumbers: ['ORD-1', 'ORD-2'] });
    expect((prismaMock.payout.findMany.mock.calls[0][0] as any).where).toEqual({ sellerId: 's1' });
  });
});

describe('PATCH /admin/sellers/:sellerId/commission', () => {
  it('fixe un taux propre au vendeur', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 's1' } as any);
    prismaMock.company.update.mockResolvedValue({ id: 's1', commissionRate: 5 } as any);

    const res = await request(buildApp()).patch('/api/payouts/admin/sellers/s1/commission').set(adminAuth).send({ rate: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ commissionRate: 5, effectiveRate: 5 });
    expect((prismaMock.company.update.mock.calls[0][0] as any).data).toEqual({ commissionRate: 5 });
  });

  it('accepte 0 % (période sans commission)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 's1' } as any);
    prismaMock.company.update.mockResolvedValue({ id: 's1', commissionRate: 0 } as any);

    const res = await request(buildApp()).patch('/api/payouts/admin/sellers/s1/commission').set(adminAuth).send({ rate: 0 });

    expect(res.status).toBe(200);
    expect(res.body.effectiveRate).toBe(0);
  });

  it('revient au taux par défaut avec null', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 's1' } as any);
    prismaMock.company.update.mockResolvedValue({ id: 's1', commissionRate: null } as any);

    const res = await request(buildApp()).patch('/api/payouts/admin/sellers/s1/commission').set(adminAuth).send({ rate: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ commissionRate: null, effectiveRate: 10 });
  });

  it.each([-1, 51, 'dix'])('refuse le taux %j', async (rate) => {
    const res = await request(buildApp()).patch('/api/payouts/admin/sellers/s1/commission').set(adminAuth).send({ rate });
    expect(res.status).toBe(400);
    expect(prismaMock.company.update).not.toHaveBeenCalled();
  });

  it('répond 404 pour un vendeur inconnu', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);
    const res = await request(buildApp()).patch('/api/payouts/admin/sellers/nope/commission').set(adminAuth).send({ rate: 5 });
    expect(res.status).toBe(404);
  });
});

describe('GET /seller/summary', () => {
  it('résume mes gains : à recevoir, en cours, déjà reçu', async () => {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller({ commissionRate: 8, payoutMethod: 'orange_money', payoutNumber: '032 00 000 00' }));
    prismaMock.order.findMany.mockResolvedValue([
      { orderNumber: 'ORD-1', status: 'delivered', receivedAt: new Date(), payoutId: null, subtotal: 100_000, shippingCost: 3_000, total: 103_000, commissionRate: 8, commissionAmount: 8_000, sellerAmount: 95_000, paidAt: new Date() },
      { orderNumber: 'ORD-2', status: 'processing', payoutId: null, subtotal: 50_000, shippingCost: 0, total: 50_000, commissionRate: 8, commissionAmount: 4_000, sellerAmount: 46_000, paidAt: new Date() },
      { orderNumber: 'ORD-3', status: 'delivered', payoutId: 'p1', subtotal: 20_000, shippingCost: 0, total: 20_000, commissionRate: 8, commissionAmount: 1_600, sellerAmount: 18_400, paidAt: new Date() },
    ] as any);
    prismaMock.payout.findMany.mockResolvedValue([
      { id: 'p1', amount: 18_400, commissionTotal: 1_600, ordersCount: 1, method: 'orange_money', reference: 'REF9', paidAt: new Date(), orders: [{ orderNumber: 'ORD-3' }] },
    ] as any);

    const res = await request(buildApp()).get('/api/payouts/seller/summary').set(sellerAuth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rate: 8,
      hasCustomRate: true,
      payoutDetails: { method: 'orange_money', number: '032 00 000 00' },
      totals: { toReceive: 95_000, inProgress: 46_000, received: 18_400, commissionPaid: 13_600 },
    });
    expect(res.body.orders.map((o: any) => [o.orderNumber, o.state])).toEqual([
      ['ORD-1', 'to_receive'],
      ['ORD-2', 'in_progress'],
      ['ORD-3', 'reversed'],
    ]);
    expect(res.body.payouts[0]).toMatchObject({ amount: 18_400, orderNumbers: ['ORD-3'] });
  });

  it("ne lit que les commandes de l'entreprise connectée, payées et non annulées", async () => {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller());
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.payout.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/payouts/seller/summary').set(sellerAuth);

    expect(res.body.rate).toBe(10);
    expect(res.body.hasCustomRate).toBe(false);
    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where).toEqual({
      sellerId: 's1',
      paymentStatus: 'paid',
      status: { not: 'cancelled' },
    });
    expect((prismaMock.payout.findMany.mock.calls[0][0] as any).where).toEqual({ sellerId: 's1' });
  });
});

describe('PUT /seller/payout-details', () => {
  it('enregistre mes coordonnées de versement', async () => {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller());
    prismaMock.company.update.mockResolvedValue({ payoutMethod: 'mvola', payoutNumber: '034 11 222 33', payoutAccountName: 'Vendeur 1' } as any);

    const res = await request(buildApp())
      .put('/api/payouts/seller/payout-details')
      .set(sellerAuth)
      .send({ method: 'mvola', number: '034 11 222 33', accountName: 'Vendeur 1' });

    expect(res.status).toBe(200);
    const args = prismaMock.company.update.mock.calls[0][0] as any;
    expect(args.where).toEqual({ id: 's1' });
    expect(args.data).toEqual({ payoutMethod: 'mvola', payoutNumber: '034 11 222 33', payoutAccountName: 'Vendeur 1' });
  });

  it.each([
    ['numéro trop court', { method: 'mvola', number: '12' }],
    ['caractères interdits', { method: 'mvola', number: "034'; DROP TABLE" }],
    ['moyen inconnu', { method: 'paypal', number: '034 11 222 33' }],
  ])('valide la saisie (%s)', async (_label, payload) => {
    prismaMock.company.findUnique.mockResolvedValue(approvedSeller());

    const res = await request(buildApp()).put('/api/payouts/seller/payout-details').set(sellerAuth).send(payload);

    expect(res.status).toBe(400);
    expect(prismaMock.company.update).not.toHaveBeenCalled();
  });
});
