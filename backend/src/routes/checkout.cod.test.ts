import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
}));
vi.mock('../services/paymentSettlement.js', () => ({ markOrdersPaid: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { markOrdersPaid } from '../services/paymentSettlement.js';
import checkoutRouter from './checkout.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'cust1', role: 'customer', companyId: null })}` };
const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };
const sellerAuth = { Authorization: `Bearer ${signToken({ userId: 'u9', role: 'company_admin', companyId: 'seller1' })}` };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', checkoutRouter);
  return app;
}

const codPayload = (overrides: Partial<any> = {}) => ({
  items: [{ productId: 'p1', quantity: 2 }],
  shippingAddress: { street: 'Lot II A 12', city: 'Tana', postalCode: '101' },
  deliveryMethod: 'standard',
  paymentMethod: 'cash_on_delivery',
  ...overrides,
});

function mockCatalog(price = 15000) {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'cust1', firstName: 'Voahangy', lastName: 'Rasoa', email: null, phone: '0341234567', verifiedPhone: '0341234567' } as any);
  prismaMock.product.findMany.mockResolvedValue([
    { id: 'p1', name: 'Produit 1', price, moq: 1, unit: 'piece', stockQuantity: 10, freeShipping: false, availableFrom: null, priceTiers: [], status: 'approved', isActive: true, seller: null, sellerId: null },
  ] as any);
  prismaMock.address.create.mockResolvedValue({ id: 'addr1', street: 'Lot II A 12', city: 'Tana', postalCode: '101', country: 'Madagascar' } as any);
  prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-COD', items: [] } as any);
  prismaMock.product.update.mockResolvedValue({} as any);
}

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(markOrdersPaid).mockClear();
  vi.stubEnv('CASH_ON_DELIVERY', 'true');
  vi.stubEnv('CASH_ON_DELIVERY_MAX_AMOUNT', '100000');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/checkout — paiement à la livraison', () => {
  it('accepte un client connecté livré à Antananarivo, sans date limite de paiement', async () => {
    mockCatalog();

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(codPayload());

    expect(res.status).toBe(200);
    expect((prismaMock.order.create.mock.calls[0][0] as any).data.paymentMethod).toBe('cash_on_delivery');
    expect(res.body.payment.expiresAt).toBeNull();
    expect(vi.mocked(sendOrderConfirmationEmail).mock.calls[0][0].payment).toMatchObject({ cashOnDelivery: true, expiresAt: null });
  });

  it('refuse une commande sans compte', async () => {
    mockCatalog();

    const res = await request(buildApp())
      .post('/api/checkout')
      .send(codPayload({ guest: { name: 'Rabe', email: 'rabe@exemple.mg', phone: '0341234567' } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/clients connectés/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('refuse une ville non desservie, mais accepte le retrait sur place', async () => {
    mockCatalog();
    const far = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send(codPayload({ shippingAddress: { street: 'Rue 1', city: 'Toamasina', postalCode: '501' } }));
    expect(far.status).toBe(400);
    expect(far.body.error).toMatch(/Antananarivo/);

    const pickup = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send(codPayload({ deliveryMethod: 'retrait', shippingAddress: undefined }));
    expect(pickup.status).toBe(200);
  });

  it('refuse au-delà du montant maximal', async () => {
    mockCatalog(60000);

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(codPayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limité/);
  });

  it("n'est pas proposé si CASH_ON_DELIVERY n'est pas activé", async () => {
    vi.stubEnv('CASH_ON_DELIVERY', '');
    mockCatalog();

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(codPayload());

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/checkout/orders/:orderId/status — paiement à la livraison et litiges', () => {
  const existing = (overrides: Partial<any> = {}) =>
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'processing',
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'awaiting',
      stockReserved: true,
      sellerId: 'seller1',
      deliveredAt: null,
      disputeOpenedAt: null,
      disputeResolvedAt: null,
      items: [],
      ...overrides,
    } as any);
  const updated = (status: string) =>
    prismaMock.order.update.mockResolvedValue({
      id: 'o1', orderNumber: 'ORD', status, total: 1, deliveryMethod: 'standard',
      company: null, user: null, customer: null, address: null, items: [],
    } as any);

  it('laisse le vendeur expédier une commande payable à la livraison', async () => {
    existing();
    updated('shipped');

    const res = await request(buildApp()).patch('/api/checkout/orders/o1/status').set(sellerAuth).send({ status: 'shipped' });

    expect(res.status).toBe(200);
  });

  it("réserve à l'administrateur la livraison (encaissement) et enregistre alors le paiement", async () => {
    existing({ status: 'shipped' });
    updated('delivered');

    const seller = await request(buildApp()).patch('/api/checkout/orders/o1/status').set(sellerAuth).send({ status: 'delivered' });
    expect(seller.status).toBe(403);
    expect(markOrdersPaid).not.toHaveBeenCalled();

    const admin = await request(buildApp()).patch('/api/checkout/orders/o1/status').set(adminAuth).send({ status: 'delivered' });
    expect(admin.status).toBe(200);
    expect(markOrdersPaid).toHaveBeenCalledOnce();
    expect((prismaMock.order.update.mock.calls[0][0] as any).data.deliveredAt).toBeInstanceOf(Date);
  });

  it('confirme la réception dès la livraison quand le délai de protection vaut 0', async () => {
    vi.stubEnv('BUYER_PROTECTION_DAYS', '0');
    existing({ status: 'shipped', paymentMethod: 'mvola', paymentStatus: 'paid' });
    updated('delivered');

    await request(buildApp()).patch('/api/checkout/orders/o1/status').set(adminAuth).send({ status: 'delivered' });

    expect((prismaMock.order.update.mock.calls[0][0] as any).data).toMatchObject({ receivedBy: 'auto' });
  });

  it('bloque tout changement de statut pendant un litige', async () => {
    existing({ status: 'delivered', paymentStatus: 'paid', disputeOpenedAt: new Date() });

    const res = await request(buildApp()).patch('/api/checkout/orders/o1/status').set(adminAuth).send({ status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});
