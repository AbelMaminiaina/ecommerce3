import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/emailService.js', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendOrderCancellationEmail: vi.fn().mockResolvedValue(true),
  sendOrderShippedEmail: vi.fn().mockResolvedValue(true),
  sendOrderDeliveredEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { signToken } from '../lib/auth.js';
import {
  sendOrderConfirmationEmail,
  sendOrderCancellationEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
} from '../services/emailService.js';
import checkoutRouter from './checkout.js';
import { SHIPPING_COSTS, FREE_SHIPPING_THRESHOLD } from '../lib/shipping.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

process.env.PAYMENT_MVOLA_NUMBER = '034 00 000 00';
process.env.PAYMENT_ACCOUNT_NAME = 'Tsena Pro';

const adminToken = signToken({ userId: 'admin1', role: 'platform_admin', companyId: null });
const buyerToken = signToken({ userId: 'buyer1', role: 'buyer', companyId: 'c1' });
const customerToken = signToken({ userId: 'cust1', role: 'customer', companyId: null });
const customerAuth = { Authorization: `Bearer ${customerToken}` };
const adminAuth = { Authorization: `Bearer ${adminToken}` };
const buyerAuth = { Authorization: `Bearer ${buyerToken}` };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(sendOrderCancellationEmail).mockClear();
  vi.mocked(sendOrderShippedEmail).mockClear();
  vi.mocked(sendOrderDeliveredEmail).mockClear();
  vi.mocked(invalidateProductCache).mockClear();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', checkoutRouter);
  return app;
}

const validPayload = {
  items: [
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
  ],
  shippingAddress: {
    street: '12 rue des Champs',
    city: 'Antananarivo',
    postalCode: '101',
  },
  deliveryMethod: 'standard' as const,
  paymentMethod: 'mvola' as const,
};

function mockApprovedCompany(overrides: Partial<any> = {}) {
  prismaMock.company.findUnique.mockResolvedValue({
    id: 'c1',
    status: 'approved',
    name: 'Grossiste Test',
    contactEmail: 'contact@test.example',
    contactPhone: null,
    ...overrides,
  } as any);
}

function mockHappyPath({ stockQuantity = 10 }: { stockQuantity?: number } = {}) {
  mockApprovedCompany();
  prismaMock.product.findMany.mockResolvedValue([
    { id: 'p1', name: 'Produit 1', price: 15000, moq: 1, unit: 'piece', stockQuantity, freeShipping: false, availableFrom: null, priceTiers: [] },
    { id: 'p2', name: 'Produit 2', price: 5000, moq: 1, unit: 'piece', stockQuantity, freeShipping: false, availableFrom: null, priceTiers: [] },
  ] as any);
  prismaMock.address.create.mockResolvedValue({ id: 'addr1', street: '12 rue des Champs', city: 'Antananarivo', postalCode: '101', country: 'Madagascar' } as any);
  prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-TEST', items: [] } as any);
  prismaMock.product.update.mockResolvedValue({} as any);
}

describe('POST /api/checkout', () => {
  it('asks a visitor without account for their contact details', async () => {
    const res = await request(buildApp()).post('/api/checkout').send(validPayload);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('coordonnées');
  });

  it('still rejects an invalid token', async () => {
    const res = await request(buildApp())
      .post('/api/checkout')
      .set({ Authorization: 'Bearer nimportequoi' })
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('rejects a request from a company that is not approved', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(res.status).toBe(403);
  });

  it('rejects an invalid payload', async () => {
    mockApprovedCompany();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ items: [], deliveryMethod: 'standard', paymentMethod: 'mvola' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Données invalides');
  });

  it('requires a shipping address unless the delivery method is retrait', async () => {
    mockApprovedCompany();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ items: [{ productId: 'p1', quantity: 1 }], deliveryMethod: 'standard', paymentMethod: 'mvola' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Aa]dresse/);
  });

  it('rejects an item below the product MOQ', async () => {
    mockApprovedCompany();
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Carton', price: 1200, moq: 25, unit: 'carton', stockQuantity: 100, freeShipping: false, availableFrom: null, priceTiers: [] },
    ] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ items: [{ productId: 'p1', quantity: 5 }], deliveryMethod: 'retrait', paymentMethod: 'mvola' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Qq]uantité minimum/);
  });

  it('ignores any price sent by the client and resolves it server-side from price tiers', async () => {
    mockApprovedCompany();
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Carton', price: 1200, moq: 1, unit: 'carton', stockQuantity: 1000, freeShipping: false, availableFrom: null, priceTiers: [{ minQty: 100, unitPrice: 1000 }] },
    ] as any);
    prismaMock.address.create.mockResolvedValue({ id: 'addr1' } as any);
    prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-TEST', items: [] } as any);
    prismaMock.product.update.mockResolvedValue({} as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({
        items: [{ productId: 'p1', quantity: 150, price: 1 }], // le "price" client, s'il existe, est ignoré
        shippingAddress: validPayload.shippingAddress,
        deliveryMethod: 'standard',
        paymentMethod: 'mvola',
      });

    expect(res.status).toBe(200);
    const orderCreateArgs = prismaMock.order.create.mock.calls[0][0] as any;
    expect(orderCreateArgs.data.items.create[0].price).toBe(1000); // palier appliqué, pas le prix envoyé par le client
    expect(orderCreateArgs.data.subtotal).toBe(150_000);
  });

  it('computes subtotal, shipping cost and total, and creates the order awaiting payment with stock reserved', async () => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    // subtotal = 15000*2 + 5000*1 = 35000 (below the free-shipping threshold) → standard flat rate
    expect(res.body.total).toBe(35000 + SHIPPING_COSTS.standard);

    const orderCreateArgs = prismaMock.order.create.mock.calls[0][0] as any;
    expect(orderCreateArgs.data.subtotal).toBe(35000);
    expect(orderCreateArgs.data.shippingCost).toBe(SHIPPING_COSTS.standard);
    expect(orderCreateArgs.data.total).toBe(35000 + SHIPPING_COSTS.standard);
    expect(orderCreateArgs.data.status).toBe('pending');
    expect(orderCreateArgs.data.paymentMethod).toBe('mvola');
    expect(orderCreateArgs.data.paymentStatus).toBe('awaiting');
    expect(orderCreateArgs.data.stockReserved).toBe(true);
    expect(orderCreateArgs.data.companyId).toBe('c1');
    expect(orderCreateArgs.data.userId).toBe('buyer1');
    expect(orderCreateArgs.data.paymentTerms).toBeUndefined();
  });

  it('returns the Mobile Money payment instructions with the total to pay', async () => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.payment).toEqual({
      method: 'mvola',
      label: 'MVola',
      number: '034 00 000 00',
      accountName: 'Tsena Pro',
      totalAmount: 35000 + SHIPPING_COSTS.standard,
      expiresAt: expect.any(String),
    });
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('gives a payment deadline 48 h after the order (or none when the automatic cancellation is off)', async () => {
    mockHappyPath();
    const before = Date.now();
    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);
    const deadline = new Date(res.body.payment.expiresAt).getTime();
    expect(deadline).toBeGreaterThanOrEqual(before + 48 * 3600_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 48 * 3600_000);
    expect(vi.mocked(sendOrderConfirmationEmail).mock.calls[0][0].payment?.expiresAt).toBeInstanceOf(Date);

    process.env.UNPAID_ORDER_EXPIRY_HOURS = '0';
    mockHappyPath();
    const off = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);
    delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
    expect(off.body.payment.expiresAt).toBeNull();
  });

  it('requires a payment method (no deferred or on-delivery payment)', async () => {
    mockHappyPath();
    const { paymentMethod: _omit, ...withoutPayment } = validPayload;

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(withoutPayment);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Données invalides');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects a payment method whose merchant number is not configured', async () => {
    mockHappyPath();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...validPayload, paymentMethod: 'airtel_money' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('moyen de paiement');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects the removed payment methods (deferred, on delivery)', async () => {
    mockHappyPath();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...validPayload, paymentMethod: 'net_30' });

    expect(res.status).toBe(400);
  });

  it('applies free shipping once the subtotal reaches the free-shipping threshold', async () => {
    mockApprovedCompany();
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Produit 1', price: FREE_SHIPPING_THRESHOLD, moq: 1, unit: 'piece', stockQuantity: 10, freeShipping: false, availableFrom: null, priceTiers: [] },
    ] as any);
    prismaMock.address.create.mockResolvedValue({ id: 'addr1' } as any);
    prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-TEST', items: [] } as any);
    prismaMock.product.update.mockResolvedValue({} as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...validPayload, items: [{ productId: 'p1', quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(FREE_SHIPPING_THRESHOLD);
  });

  it('keeps the order pending without reserving stock when stock is insufficient', async () => {
    mockHappyPath({ stockQuantity: 0 });

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect((prismaMock.order.create.mock.calls[0][0] as any).data.stockReserved).toBe(false);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('decrements stock for every purchased item when in stock', async () => {
    mockHappyPath({ stockQuantity: 10 });

    await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: 8, inStock: true },
    });
  });

  it('sends the order confirmation email asynchronously without blocking the response', async () => {
    mockHappyPath();

    await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    const emailArg = vi.mocked(sendOrderConfirmationEmail).mock.calls[0][0];
    expect(emailArg.orderNumber).toBe('ORD-TEST');
    expect(emailArg.companyName).toBe('Grossiste Test');
  });

  it('returns 500 on unexpected errors', async () => {
    mockApprovedCompany();
    prismaMock.product.findMany.mockRejectedValue(new Error('db down'));

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(validPayload);

    expect(res.status).toBe(500);
  });
});

describe('POST /api/checkout (particulier)', () => {
  function mockCustomerHappyPath() {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'cust1', email: 'client@example.com', firstName: 'Marie', lastName: 'Rakoto', phone: '0341234567',
    } as any);
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Carton', price: 1200, moq: 50, unit: 'carton', stockQuantity: 100, freeShipping: false, availableFrom: null, priceTiers: [{ minQty: 10, unitPrice: 800 }] },
    ] as any);
    prismaMock.address.create.mockResolvedValue({ id: 'addr1', street: '12 rue', city: 'Tana', postalCode: '101', country: 'Madagascar' } as any);
    prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-TEST', items: [] } as any);
    prismaMock.product.update.mockResolvedValue({} as any);
  }

  const payload = {
    items: [{ productId: 'p1', quantity: 50 }],
    shippingAddress: { street: '12 rue', city: 'Tana', postalCode: '101' },
    deliveryMethod: 'standard' as const,
    paymentMethod: 'mvola' as const,
  };

  it('enforces the MOQ for a customer too (vente en gros)', async () => {
    mockCustomerHappyPath();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send({ ...payload, items: [{ productId: 'p1', quantity: 12 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Qq]uantité minimum/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('orders at base price once the MOQ is reached, without wholesale tiers', async () => {
    mockCustomerHappyPath();

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send({ ...payload, items: [{ productId: 'p1', quantity: 50 }] });

    expect(res.status).toBe(200);
    const args = prismaMock.order.create.mock.calls[0][0] as any;
    expect(args.data.items.create[0].price).toBe(1200);
    expect(args.data.subtotal).toBe(60_000);
  });

  it('creates no invoice for a customer, and links order and address to the user', async () => {
    mockCustomerHappyPath();

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send(payload);

    expect(res.status).toBe(200);
    expect(res.body.invoiceNumber).toBeUndefined();
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled();
    const orderArgs = prismaMock.order.create.mock.calls[0][0] as any;
    expect(orderArgs.data.companyId).toBeNull();
    expect(orderArgs.data.userId).toBe('cust1');
    expect(orderArgs.data.paymentTerms).toBeUndefined();
    expect(orderArgs.data.dueDate).toBeUndefined();
    const addressArgs = prismaMock.address.create.mock.calls[0][0] as any;
    expect(addressArgs.data.userId).toBe('cust1');
    expect(addressArgs.data.companyId).toBeUndefined();
  });

  it('emails the customer using their own name and address', async () => {
    mockCustomerHappyPath();

    await request(buildApp()).post('/api/checkout').set(customerAuth).send(payload);

    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Marie Rakoto', contactEmail: 'client@example.com' })
    );
  });
});

describe('GET /api/checkout/orders', () => {
  it('rejects a non-admin user', async () => {
    const res = await request(buildApp()).get('/api/checkout/orders').set(buyerAuth);
    expect(res.status).toBe(403);
  });

  it('lists all orders for an admin', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/checkout/orders').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
  });
});

describe('GET /api/checkout/orders/mine', () => {
  it('rejects an unapproved company', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);

    const res = await request(buildApp()).get('/api/checkout/orders/mine').set(buyerAuth);

    expect(res.status).toBe(403);
  });

  it('returns the orders scoped to the caller company', async () => {
    mockApprovedCompany();
    prismaMock.order.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/checkout/orders/mine').set(buyerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1' } })
    );
  });
});

describe('GET /api/checkout/orders/mine (particulier)', () => {
  it('returns the orders placed by the customer user', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/checkout/orders/mine').set(customerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'cust1' } })
    );
  });
});

describe('PATCH /api/checkout/orders/:orderId/status', () => {
  function mockExistingOrder(overrides: Partial<any> = {}) {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'processing',
      paymentStatus: 'paid',
      stockReserved: true,
      items: [{ productId: 'p1', quantity: 2 }],
      ...overrides,
    } as any);
  }

  function mockUpdatedOrder(overrides: Partial<any> = {}) {
    prismaMock.order.update.mockResolvedValue({
      id: 'o1',
      orderNumber: 'ORD-TEST',
      status: 'shipped',
      total: 45000,
      deliveryMethod: 'standard',
      company: { name: 'Grossiste Test', contactEmail: 'contact@test.example' },
      customer: null,
      address: { street: '12 rue des Champs', city: 'Antananarivo', postalCode: '101', country: 'Madagascar' },
      items: [{ quantity: 2, price: 15000, product: { name: 'Produit 1' } }],
      ...overrides,
    } as any);
  }

  it('rejects a non-admin user', async () => {
    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(buyerAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(403);
  });

  it('rejects an invalid status', async () => {
    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'not-a-status' });

    expect(res.status).toBe(400);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/checkout/orders/missing/status')
      .set(adminAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(404);
  });

  it('updates the order status', async () => {
    mockExistingOrder();
    mockUpdatedOrder({ status: 'shipped' });

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('shipped');
  });

  it('refuses to advance an order whose payment is not confirmed', async () => {
    mockExistingOrder({ status: 'pending', paymentStatus: 'submitted' });

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('paiement');
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel an order already paid out to the seller', async () => {
    mockExistingOrder({ status: 'delivered', payoutId: 'p1' });

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'cancelled', reason: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('reversée');
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('still allows cancelling an unpaid order', async () => {
    mockExistingOrder({ status: 'pending', paymentStatus: 'awaiting', stockReserved: false });
    mockUpdatedOrder({ status: 'cancelled' });

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'cancelled', reason: 'Non payée' });

    expect(res.status).toBe(200);
  });

  it('reserves the stock when a paid order that was out of stock advances', async () => {
    mockExistingOrder({ status: 'pending', stockReserved: false });
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Produit 1', stockQuantity: 5 }] as any);
    prismaMock.product.update.mockResolvedValue({} as any);
    mockUpdatedOrder({ status: 'processing' });

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { decrement: 2 } },
    });
    expect((prismaMock.order.update.mock.calls[0][0] as any).data.stockReserved).toBe(true);
  });

  it('refuses to advance a paid order when the stock is still insufficient', async () => {
    mockExistingOrder({ status: 'pending', stockReserved: false });
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Produit 1', stockQuantity: 1 }] as any);

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'processing' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Stock insuffisant');
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('restores stock for every item when cancelling a processing order', async () => {
    mockExistingOrder({
      status: 'processing',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
    mockUpdatedOrder({ status: 'cancelled' });
    prismaMock.product.update.mockResolvedValue({} as any);

    await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'cancelled', reason: 'Test' });

    expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: 2 }, inStock: true },
    });
  });

  it('does not restore stock when cancelling an order whose stock was never reserved', async () => {
    mockExistingOrder({ status: 'pending', stockReserved: false });
    mockUpdatedOrder({ status: 'cancelled' });

    await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'cancelled' });

    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/checkout/:orderNumber', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp()).get('/api/checkout/ORD-UNKNOWN');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the order is not found', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/checkout/ORD-UNKNOWN').set(adminAuth);

    expect(res.status).toBe(404);
  });

  it('allows the owning company to read its own order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', companyId: 'c1' } as any);

    const res = await request(buildApp()).get('/api/checkout/ORD-1').set(buyerAuth);

    expect(res.status).toBe(200);
  });

  it('rejects a company reading another company order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', companyId: 'some-other-company' } as any);

    const res = await request(buildApp()).get('/api/checkout/ORD-1').set(buyerAuth);

    expect(res.status).toBe(403);
  });

  it('allows a platform admin to read any order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', companyId: 'some-other-company' } as any);

    const res = await request(buildApp()).get('/api/checkout/ORD-1').set(adminAuth);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/checkout (multi-vendeurs)', () => {
  const productRow = (id: string, extra: Partial<any> = {}) => ({
    id,
    name: `Produit ${id}`,
    price: 100000,
    moq: 10,
    unit: 'piece',
    stockQuantity: 100,
    freeShipping: false,
    availableFrom: null,
    priceTiers: [],
    status: 'approved',
    isActive: true,
    sellerId: null,
    seller: null,
    ...extra,
  });

  function mockOrders() {
    mockApprovedCompany();
    prismaMock.address.create.mockResolvedValue({ id: 'addr1', street: 'r', city: 'Tana', postalCode: '101', country: 'Madagascar' } as any);
    let n = 0;
    prismaMock.order.create.mockImplementation((async () => ({ id: `order${++n}`, orderNumber: `ORD-${n}`, items: [] })) as any);
    prismaMock.product.update.mockResolvedValue({} as any);
  }

  const payload = {
    items: [
      { productId: 'pA', quantity: 10 },
      { productId: 'pB', quantity: 10 },
      { productId: 'pC', quantity: 10 },
    ],
    shippingAddress: { street: 'r', city: 'Tana', postalCode: '101' },
    deliveryMethod: 'standard' as const,
    paymentMethod: 'mvola' as const,
  };

  it('scinde le panier en une commande par vendeur', async () => {
    mockOrders();
    prismaMock.product.findMany.mockResolvedValue([
      productRow('pA', { sellerId: 's1', seller: { id: 's1', name: 'Vendeur 1', status: 'approved' } }),
      productRow('pB', { sellerId: 's1', seller: { id: 's1', name: 'Vendeur 1', status: 'approved' } }),
      productRow('pC'),
    ] as any);

    const res = await request(buildApp()).post('/api/checkout').set(buyerAuth).send(payload);

    expect(res.status).toBe(200);
    expect(prismaMock.order.create).toHaveBeenCalledTimes(2);
    const created = prismaMock.order.create.mock.calls.map((c) => (c[0] as any).data);
    expect(created.map((d) => d.sellerId).sort()).toEqual([null, 's1']);
    expect(new Set(created.map((d) => d.checkoutGroup)).size).toBe(1);
    expect(res.body.orders).toHaveLength(2);
    expect(res.body.orders.map((o: any) => o.sellerName)).toEqual(expect.arrayContaining([null, 'Vendeur 1']));
    // Livraison offerte sur chaque commande (au-dessus du seuil) : le total est la somme des commandes
    expect(res.body.total).toBe(3_000_000);
    // Un seul paiement pour tout le panier
    expect(res.body.payment.totalAmount).toBe(3_000_000);
    expect(vi.mocked(sendOrderConfirmationEmail).mock.calls.every((c) => c[0].payment?.totalToPay === 3_000_000)).toBe(true);
  });

  it('calcule la livraison séparément pour chaque vendeur', async () => {
    mockOrders();
    prismaMock.product.findMany.mockResolvedValue([
      productRow('pA', { price: 5000, sellerId: 's1', seller: { id: 's1', name: 'V1', status: 'approved' } }),
      productRow('pB', { price: 5000, sellerId: 's2', seller: { id: 's2', name: 'V2', status: 'approved' } }),
    ] as any);

    await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...payload, items: [{ productId: 'pA', quantity: 10 }, { productId: 'pB', quantity: 10 }] });

    const created = prismaMock.order.create.mock.calls.map((c) => (c[0] as any).data);
    expect(created.map((d) => d.shippingCost)).toEqual([SHIPPING_COSTS.standard, SHIPPING_COSTS.standard]);
  });

  it('refuse un produit non validé ou désactivé', async () => {
    mockOrders();
    prismaMock.product.findMany.mockResolvedValue([productRow('pA', { status: 'pending' })] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...payload, items: [{ productId: 'pA', quantity: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('plus disponible');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("refuse un produit dont le vendeur n'est plus approuvé", async () => {
    mockOrders();
    prismaMock.product.findMany.mockResolvedValue([
      productRow('pA', { sellerId: 's1', seller: { id: 's1', name: 'V1', status: 'suspended' } }),
    ] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...payload, items: [{ productId: 'pA', quantity: 10 }] });

    expect(res.status).toBe(400);
  });

  it("interdit à une entreprise d'acheter son propre produit", async () => {
    mockOrders();
    prismaMock.product.findMany.mockResolvedValue([
      productRow('pA', { sellerId: 'c1', seller: { id: 'c1', name: 'Moi', status: 'approved' } }),
    ] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(buyerAuth)
      .send({ ...payload, items: [{ productId: 'pA', quantity: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('votre propre produit');
  });

  it('applique la quantité minimum de gros aussi aux particuliers', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'cust1', firstName: 'A', lastName: 'B', email: 'a@b.mg', phone: null } as any);
    prismaMock.product.findMany.mockResolvedValue([productRow('pA')] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send({ ...payload, items: [{ productId: 'pA', quantity: 3 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Quantité minimum');
  });
});

describe('PATCH /api/checkout/orders/:orderId/status (vendeur)', () => {
  const sellerToken = signToken({ userId: 'u9', role: 'company_admin', companyId: 'seller1' });
  const sellerAuth = { Authorization: `Bearer ${sellerToken}` };

  it('autorise le vendeur propriétaire de la commande', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', status: 'processing', paymentStatus: 'paid', stockReserved: true, sellerId: 'seller1', items: [] } as any);
    prismaMock.order.update.mockResolvedValue({
      id: 'o1', orderNumber: 'ORD', status: 'shipped', total: 1, deliveryMethod: 'standard',
      company: { name: 'X', contactEmail: 'x@x.mg' }, customer: null, address: null, items: [],
    } as any);

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(sellerAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(200);
  });

  it("refuse un vendeur qui n'est pas celui de la commande", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', status: 'processing', sellerId: 'autre', items: [] } as any);

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(sellerAuth)
      .send({ status: 'shipped' });

    expect(res.status).toBe(403);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/checkout/orders/seller', () => {
  it("liste les commandes reçues par l'entreprise vendeuse", async () => {
    const token = signToken({ userId: 'u9', role: 'company_admin', companyId: 'seller1' });
    prismaMock.company.findUnique.mockResolvedValue({ id: 'seller1', status: 'approved' } as any);
    prismaMock.order.findMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/checkout/orders/seller').set({ Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect((prismaMock.order.findMany.mock.calls[0][0] as any).where).toEqual({ sellerId: 'seller1' });
  });

  it('refuse un particulier', async () => {
    const res = await request(buildApp()).get('/api/checkout/orders/seller').set(customerAuth);
    expect(res.status).toBe(403);
  });
});
