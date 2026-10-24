import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({ invalidateProductCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/emailService.js', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendOrderCancellationEmail: vi.fn().mockResolvedValue(true),
  sendOrderShippedEmail: vi.fn().mockResolvedValue(true),
  sendOrderDeliveredEmail: vi.fn().mockResolvedValue(true),
  sendReferralRewardEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import checkoutRouter from './checkout.js';
import promoRouter from './promo.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'cust1', role: 'customer', companyId: null })}` };
const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };

process.env.PAYMENT_MVOLA_NUMBER = '034 00 000 00';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/promo', promoRouter);
  return app;
}

const promo = (overrides: Partial<any> = {}) =>
  ({
    id: 'pc1',
    code: 'BIENVENUE',
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
    description: null,
    ...overrides,
  }) as any;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.order.count.mockResolvedValue(0);
  prismaMock.promoRedemption.count.mockResolvedValue(0);
});

describe('POST /api/checkout avec un code promo', () => {
  function mockTwoSellers() {
    prismaMock.user.findUnique.mockImplementation((async ({ select }: any) =>
      select?.referredById ? { referredById: null } : { id: 'cust1', firstName: 'Voahangy', lastName: 'Rasoa', email: 'v@exemple.mg', phone: null, verifiedPhone: null }) as any);
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Perceuse', price: 60_000, moq: 1, unit: 'piece', stockQuantity: 10, freeShipping: false, availableFrom: null, priceTiers: [], status: 'approved', isActive: true, sellerId: 's1', seller: { id: 's1', name: 'Vendeur 1', status: 'approved' } },
      { id: 'p2', name: 'Ciment', price: 40_000, moq: 1, unit: 'sac', stockQuantity: 10, freeShipping: false, availableFrom: null, priceTiers: [], status: 'approved', isActive: true, sellerId: 's2', seller: { id: 's2', name: 'Vendeur 2', status: 'approved' } },
    ] as any);
    prismaMock.address.create.mockResolvedValue({ id: 'a1', street: 'Rue', city: 'Antananarivo', postalCode: '101', country: 'Madagascar' } as any);
    let n = 0;
    prismaMock.order.create.mockImplementation((async () => ({ id: `o${++n}`, orderNumber: `ORD-${n}`, items: [] })) as any);
    prismaMock.product.update.mockResolvedValue({} as any);
  }

  const payload = {
    items: [
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 1 },
    ],
    shippingAddress: { street: 'Rue', city: 'Antananarivo', postalCode: '101' },
    deliveryMethod: 'retrait',
    paymentMethod: 'mvola',
    promoCode: 'bienvenue',
  };

  it('répartit la remise entre les commandes des vendeurs et la déduit du total', async () => {
    mockTwoSellers();
    prismaMock.promoCode.findUnique.mockResolvedValue(promo());
    prismaMock.promoCode.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(payload);

    expect(res.status).toBe(200);
    expect(res.body.discount).toEqual({ code: 'BIENVENUE', amount: 10_000 });
    const created = prismaMock.order.create.mock.calls.map((c) => (c[0] as any).data);
    expect(created.map((o) => o.discountAmount)).toEqual([6_000, 4_000]);
    expect(created.map((o) => o.total)).toEqual([54_000, 36_000]);
    expect(created.every((o) => o.promoCode === 'BIENVENUE')).toBe(true);
    expect(prismaMock.promoRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ promoCodeId: 'pc1', userId: 'cust1', discountAmount: 10_000 }),
    });
  });

  it('refuse un code invalide sans créer de commande', async () => {
    mockTwoSellers();
    prismaMock.promoCode.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/promo/preview', () => {
  it('annonce la remise', async () => {
    prismaMock.promoCode.findUnique.mockResolvedValue(promo({ maxDiscount: 15_000 }));

    const res = await request(buildApp()).post('/api/promo/preview').send({ code: 'BIENVENUE', itemsSubtotal: 200_000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 'BIENVENUE', discount: 15_000 });
  });

  it('explique pourquoi un code ne s’applique pas', async () => {
    prismaMock.promoCode.findUnique.mockResolvedValue(promo({ minSubtotal: 100_000 }));

    const res = await request(buildApp()).post('/api/promo/preview').send({ code: 'BIENVENUE', itemsSubtotal: 50_000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dès 100/);
  });
});

describe('GET /api/promo/referral', () => {
  it('donne le code, le lien à partager et les bons gagnés', async () => {
    prismaMock.promoCode.findFirst.mockResolvedValue(promo({ id: 'ref1', code: 'TSENA-ABCDEF', kind: 'referral', ownerUserId: 'cust1', maxDiscount: 20_000 }));
    prismaMock.promoRedemption.count.mockResolvedValue(2);
    prismaMock.promoCode.findMany.mockResolvedValue([
      promo({ code: 'MERCI-AAAAAA', kind: 'reward', type: 'fixed', value: 5_000, maxUses: 1, usedCount: 1 }),
      promo({ code: 'MERCI-BBBBBB', kind: 'reward', type: 'fixed', value: 5_000, maxUses: 1, endsAt: new Date(Date.now() + 86_400_000) }),
    ]);

    const res = await request(buildApp()).get('/api/promo/referral').set(customerAuth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 'TSENA-ABCDEF', referrals: 2, discountPercent: 10, rewardAmount: 5_000 });
    expect(res.body.link).toMatch(/\?ref=TSENA-ABCDEF$/);
    expect(res.body.rewards.map((r: any) => r.status)).toEqual(['used', 'available']);
  });
});

describe('administration des codes', () => {
  it('crée un code en majuscules, et refuse un pourcentage trop élevé', async () => {
    prismaMock.promoCode.create.mockImplementation((async ({ data }: any) => ({ id: 'n1', usedCount: 0, ...data })) as any);

    const ok = await request(buildApp())
      .post('/api/promo/admin')
      .set(adminAuth)
      .send({ code: 'fete-26', type: 'percent', value: 15, maxDiscount: 30_000, endsAt: '2026-12-31T23:59:00Z' });
    expect(ok.status).toBe(201);
    expect((prismaMock.promoCode.create.mock.calls[0][0] as any).data).toMatchObject({ code: 'FETE-26', kind: 'standard', value: 15 });

    const tooMuch = await request(buildApp()).post('/api/promo/admin').set(adminAuth).send({ code: 'TROP', type: 'percent', value: 95 });
    expect(tooMuch.status).toBe(400);
  });

  it('est réservée aux administrateurs', async () => {
    const res = await request(buildApp()).post('/api/promo/admin').set(customerAuth).send({ code: 'X', type: 'fixed', value: 1 });
    expect(res.status).toBe(403);
  });

  it('désactive un code sans toucher aux autres champs', async () => {
    prismaMock.promoCode.findUnique.mockResolvedValue(promo());
    prismaMock.promoCode.update.mockResolvedValue(promo({ isActive: false }));

    await request(buildApp()).patch('/api/promo/admin/pc1').set(adminAuth).send({ isActive: false });

    expect(prismaMock.promoCode.update).toHaveBeenCalledWith({ where: { id: 'pc1' }, data: { isActive: false } });
  });
});
