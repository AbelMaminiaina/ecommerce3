import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../services/emailService.js', () => ({
  sendDisputeOpenedEmail: vi.fn().mockResolvedValue(true),
  sendDisputeResolvedEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('../services/smsNotifications.js', () => ({ sendDisputeResolvedSms: vi.fn() }));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { sendDisputeOpenedEmail, sendDisputeResolvedEmail } from '../services/emailService.js';
import { sendDisputeResolvedSms } from '../services/smsNotifications.js';
import { autoConfirmReceipts } from '../services/buyerProtection.js';
import router from './orderProtection.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const buyerAuth = { Authorization: `Bearer ${signToken({ userId: 'cust1', role: 'customer', companyId: null })}` };
const otherAuth = { Authorization: `Bearer ${signToken({ userId: 'autre', role: 'customer', companyId: null })}` };
const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', router);
  return app;
}

const order = (overrides: Partial<any> = {}) =>
  ({
    id: 'o1',
    orderNumber: 'ORD-1',
    userId: 'cust1',
    companyId: null,
    status: 'delivered',
    paymentStatus: 'paid',
    paymentMethod: 'mvola',
    total: 45000,
    deliveredAt: new Date(),
    receivedAt: null,
    disputeOpenedAt: null,
    disputeResolvedAt: null,
    disputeResolution: null,
    payoutId: null,
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    company: null,
    user: { firstName: 'Voahangy', lastName: 'Rasoa', email: 'voahangy@exemple.mg', phone: null, verifiedPhone: '0341234567' },
    seller: { name: 'Quincaillerie', contactEmail: 'vendeur@exemple.mg' },
    ...overrides,
  }) as any;

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendDisputeOpenedEmail).mockClear();
  vi.mocked(sendDisputeResolvedEmail).mockClear();
  vi.mocked(sendDisputeResolvedSms).mockClear();
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/orders/:orderId/confirm-receipt', () => {
  it("confirme la réception : le vendeur pourra être payé", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());

    const res = await request(buildApp()).post('/api/orders/o1/confirm-receipt').set(buyerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', receivedAt: null, disputeOpenedAt: null },
      data: { receivedAt: expect.any(Date), receivedBy: 'buyer' },
    });
  });

  it('passe aussi en « livrée » une commande encore « expédiée »', async () => {
    prismaMock.order.findUnique.mockResolvedValue(order({ status: 'shipped', deliveredAt: null }));

    await request(buildApp()).post('/api/orders/o1/confirm-receipt').set(buyerAuth);

    expect((prismaMock.order.updateMany.mock.calls[0][0] as any).data).toMatchObject({ status: 'delivered', receivedBy: 'buyer' });
  });

  it("répond 404 à un autre client que l'acheteur", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());

    const res = await request(buildApp()).post('/api/orders/o1/confirm-receipt').set(otherAuth);

    expect(res.status).toBe(404);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/orders/:orderId/dispute', () => {
  it("suspend le reversement et prévient l'administrateur et le vendeur", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());

    const res = await request(buildApp())
      .post('/api/orders/o1/dispute')
      .set(buyerAuth)
      .send({ reason: 'Le carton était abîmé et il manque deux pièces.' });

    expect(res.status).toBe(201);
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', receivedAt: null, disputeOpenedAt: null, payoutId: null },
      data: { disputeOpenedAt: expect.any(Date), disputeReason: 'Le carton était abîmé et il manque deux pièces.' },
    });
    expect(sendDisputeOpenedEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendDisputeOpenedEmail).mock.calls[1][0].contactEmail).toBe('vendeur@exemple.mg');
  });

  it('refuse après le délai de protection', async () => {
    prismaMock.order.findUnique.mockResolvedValue(order({ deliveredAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) }));

    const res = await request(buildApp()).post('/api/orders/o1/dispute').set(buyerAuth).send({ reason: 'Produit non conforme à la description' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/délai/);
  });

  it('exige une description du problème', async () => {
    const res = await request(buildApp()).post('/api/orders/o1/dispute').set(buyerAuth).send({ reason: 'nul' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/orders/admin/:orderId/dispute', () => {
  const disputed = () => order({ disputeOpenedAt: new Date(), disputeReason: 'Abîmé' });

  it("rembourse : la commande est annulée et ne sera jamais reversée", async () => {
    prismaMock.order.findUnique.mockResolvedValue(disputed());

    const res = await request(buildApp())
      .patch('/api/orders/admin/o1/dispute')
      .set(adminAuth)
      .send({ resolution: 'refund', note: 'Remboursé par MVola' });

    expect(res.status).toBe(200);
    expect((prismaMock.order.updateMany.mock.calls[0][0] as any).data).toMatchObject({
      status: 'cancelled',
      disputeResolution: 'refund',
      disputeNote: 'Remboursé par MVola',
    });
    expect(sendDisputeResolvedSms).toHaveBeenCalledWith({ phone: '0341234567', orderNumber: 'ORD-1', resolution: 'refund' });
    expect(sendDisputeResolvedEmail).toHaveBeenCalledOnce();
  });

  it("libère l'argent : la commande est reçue", async () => {
    prismaMock.order.findUnique.mockResolvedValue(disputed());

    await request(buildApp()).patch('/api/orders/admin/o1/dispute').set(adminAuth).send({ resolution: 'release' });

    expect((prismaMock.order.updateMany.mock.calls[0][0] as any).data).toMatchObject({
      disputeResolution: 'release',
      receivedBy: 'admin',
    });
  });

  it('refuse sans litige en cours, et pour un non-administrateur', async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());
    const none = await request(buildApp()).patch('/api/orders/admin/o1/dispute').set(adminAuth).send({ resolution: 'refund' });
    expect(none.status).toBe(409);

    const buyer = await request(buildApp()).patch('/api/orders/admin/o1/dispute').set(buyerAuth).send({ resolution: 'refund' });
    expect(buyer.status).toBe(403);
  });
});

describe('autoConfirmReceipts', () => {
  it('confirme les commandes livrées depuis le délai, sans litige', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date('2026-10-25T10:00:00Z');

    const result = await autoConfirmReceipts(now);

    expect(result.confirmed).toBe(2);
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'delivered',
        paymentStatus: 'paid',
        receivedAt: null,
        disputeOpenedAt: null,
        deliveredAt: { lte: new Date('2026-10-22T10:00:00Z') },
      },
      data: { receivedAt: now, receivedBy: 'auto' },
    });
  });
});
