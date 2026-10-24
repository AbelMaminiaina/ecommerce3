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
}));
vi.mock('../services/smsNotifications.js', () => ({
  sendOrderPlacedSms: vi.fn(),
  sendOrderStatusSms: vi.fn(),
}));

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { sendOrderStatusSms } from '../services/smsNotifications.js';
import { computeShippingCost } from '../lib/shipping.js';
import { deliveryMethodError, findShippingZone, isLocalCity } from '../lib/delivery.js';
import checkoutRouter from './checkout.js';
import shippingRouter from './shipping.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'cust1', role: 'customer', companyId: null })}` };
const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'admin1', role: 'platform_admin', companyId: null })}` };

process.env.PAYMENT_MVOLA_NUMBER = '034 00 000 00';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/shipping', shippingRouter);
  return app;
}

const zones = [
  { id: 'z1', name: 'Côte Est', cities: ['Toamasina', 'Tamatave'], price: 8_000, delay: '2 à 4 jours', isDefault: false, isActive: true, sortOrder: 2 },
  { id: 'z2', name: 'Hautes Terres', cities: ['Antsirabe', 'Fianarantsoa'], price: 7_000, delay: '2 à 3 jours', isDefault: false, isActive: true, sortOrder: 1 },
  { id: 'z9', name: 'Autres villes', cities: [], price: 15_000, delay: '5 à 8 jours', isDefault: true, isActive: true, sortOrder: 99 },
] as any[];

const relay = { id: 'r1', name: 'Épicerie Rova', address: 'Lot 12 Analakely', city: 'Antananarivo', phone: null, openingHours: '8h-18h', instructions: null, fee: 1_000, isActive: true } as any;

describe('règles de livraison', () => {
  it('reconnaît Antananarivo et ses environs', () => {
    expect(isLocalCity('Tana')).toBe(true);
    expect(isLocalCity('Ivato')).toBe(true);
    expect(isLocalCity('Toamasina')).toBe(false);
  });

  it('trouve la zone de la ville, sinon la zone par défaut', () => {
    expect(findShippingZone('Tamatave', zones)?.name).toBe('Côte Est');
    expect(findShippingZone('antsirabe I', zones)?.name).toBe('Hautes Terres');
    expect(findShippingZone('Maintirano', zones)?.name).toBe('Autres villes');
    expect(findShippingZone('Maintirano', zones.filter((z) => !z.isDefault))).toBeNull();
  });

  it('oriente vers le bon mode selon la ville', () => {
    expect(deliveryMethodError('standard', 'Antananarivo')).toBeNull();
    expect(deliveryMethodError('express', 'Toamasina')).toMatch(/province/);
    expect(deliveryMethodError('province', 'Tana')).toMatch(/standard ou express/);
    expect(deliveryMethodError('province', 'Toamasina')).toBeNull();
  });

  it('facture la province au tarif de la zone et le relais à ses frais, sans seuil de gratuité', () => {
    const items = [{ productId: 'p1', quantity: 1, price: 500_000 }];
    expect(computeShippingCost('standard', 500_000, new Set(), items)).toBe(0);
    expect(computeShippingCost('province', 500_000, new Set(), items, { provincePrice: 8_000 })).toBe(8_000);
    expect(computeShippingCost('relais', 500_000, new Set(), items, { relayFee: 1_000 })).toBe(1_000);
    expect(computeShippingCost('province', 500_000, new Set(['p1']), items, { provincePrice: 8_000 })).toBe(0);
  });
});

describe('POST /api/checkout — province et point relais', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.mocked(sendOrderConfirmationEmail).mockClear();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'cust1', firstName: 'Voahangy', lastName: 'Rasoa', email: 'v@exemple.mg', phone: null, verifiedPhone: null } as any);
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Perceuse', price: 60_000, moq: 1, unit: 'piece', stockQuantity: 10, freeShipping: false, availableFrom: null, priceTiers: [], status: 'approved', isActive: true, sellerId: null, seller: null },
    ] as any);
    prismaMock.address.create.mockResolvedValue({ id: 'a1', street: 'Rue', city: 'Toamasina', postalCode: '501', country: 'Madagascar' } as any);
    prismaMock.order.create.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', items: [] } as any);
    prismaMock.product.update.mockResolvedValue({} as any);
    prismaMock.shippingZone.findMany.mockResolvedValue(zones);
  });

  const base = { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'mvola' };

  it('applique le tarif de la zone et enregistre son nom', async () => {
    const res = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send({ ...base, deliveryMethod: 'province', shippingAddress: { street: 'Rue', city: 'Toamasina', postalCode: '501' } });

    expect(res.status).toBe(200);
    const data = (prismaMock.order.create.mock.calls[0][0] as any).data;
    expect(data).toMatchObject({ deliveryMethod: 'province', shippingCost: 8_000, shippingZone: 'Côte Est', total: 68_000 });
  });

  it('refuse la livraison standard hors d’Antananarivo', async () => {
    const res = await request(buildApp())
      .post('/api/checkout')
      .set(customerAuth)
      .send({ ...base, deliveryMethod: 'standard', shippingAddress: { street: 'Rue', city: 'Toamasina', postalCode: '501' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/province/);
  });

  it('livre en point relais sans adresse, à ses frais', async () => {
    prismaMock.pickupPoint.findUnique.mockResolvedValue(relay);

    const res = await request(buildApp()).post('/api/checkout').set(customerAuth).send({ ...base, deliveryMethod: 'relais', pickupPointId: 'r1' });

    expect(res.status).toBe(200);
    expect(prismaMock.address.create).not.toHaveBeenCalled();
    expect((prismaMock.order.create.mock.calls[0][0] as any).data).toMatchObject({ pickupPointId: 'r1', shippingCost: 1_000 });
    expect(vi.mocked(sendOrderConfirmationEmail).mock.calls[0][0].address?.street).toMatch(/Point relais Épicerie Rova/);
  });

  it('refuse un point relais désactivé ou absent', async () => {
    prismaMock.pickupPoint.findUnique.mockResolvedValue({ ...relay, isActive: false });
    const inactive = await request(buildApp()).post('/api/checkout').set(customerAuth).send({ ...base, deliveryMethod: 'relais', pickupPointId: 'r1' });
    expect(inactive.status).toBe(400);

    const missing = await request(buildApp()).post('/api/checkout').set(customerAuth).send({ ...base, deliveryMethod: 'relais' });
    expect(missing.status).toBe(400);
  });
});

describe('PATCH /api/checkout/orders/:orderId/status — suivi du colis', () => {
  it('enregistre le transporteur et le numéro de suivi, et les envoie par SMS', async () => {
    mockReset(prismaMock);
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o1', status: 'processing', paymentStatus: 'paid', stockReserved: true, items: [] } as any);
    prismaMock.order.update.mockResolvedValue({
      id: 'o1', orderNumber: 'ORD-1', status: 'shipped', total: 1, deliveryMethod: 'province', carrier: 'Cotisse', trackingNumber: 'CT-4521',
      company: null, user: { firstName: 'V', lastName: 'R', email: null, phone: null, verifiedPhone: '0341234567' }, customer: null, address: null, pickupPoint: null, items: [],
    } as any);

    const res = await request(buildApp())
      .patch('/api/checkout/orders/o1/status')
      .set(adminAuth)
      .send({ status: 'shipped', carrier: ' Cotisse ', trackingNumber: 'CT-4521' });

    expect(res.status).toBe(200);
    expect((prismaMock.order.update.mock.calls[0][0] as any).data).toMatchObject({ carrier: 'Cotisse', trackingNumber: 'CT-4521' });
    expect(sendOrderStatusSms).toHaveBeenCalledWith(expect.objectContaining({ status: 'shipped', carrier: 'Cotisse', trackingNumber: 'CT-4521' }));
  });
});

describe('GET /api/shipping/options et administration', () => {
  beforeEach(() => mockReset(prismaMock));

  it('donne les villes locales, les zones et les points relais actifs', async () => {
    prismaMock.shippingZone.findMany.mockResolvedValue(zones);
    prismaMock.pickupPoint.findMany.mockResolvedValue([relay]);

    const res = await request(buildApp()).get('/api/shipping/options');

    expect(res.status).toBe(200);
    expect(res.body.localCities).toContain('Antananarivo');
    expect(res.body.zones).toHaveLength(3);
    expect(res.body.pickupPoints[0]).toMatchObject({ id: 'r1', fee: 1_000 });
    expect(res.body.pickupPoints[0].isActive).toBeUndefined();
  });

  it('une seule zone par défaut', async () => {
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
    prismaMock.shippingZone.create.mockResolvedValue({ id: 'z10' } as any);

    const res = await request(buildApp())
      .post('/api/shipping/admin/zones')
      .set(adminAuth)
      .send({ name: 'Reste de l’île', price: 20_000, delay: '7 jours', isDefault: true });

    expect(res.status).toBe(201);
    expect(prismaMock.shippingZone.updateMany).toHaveBeenCalledWith({ where: { isDefault: true }, data: { isDefault: false } });
  });

  it('valide un point relais et réserve la gestion aux administrateurs', async () => {
    const invalid = await request(buildApp()).post('/api/shipping/admin/pickup-points').set(adminAuth).send({ name: 'X' });
    expect(invalid.status).toBe(400);

    const forbidden = await request(buildApp()).post('/api/shipping/admin/pickup-points').set(customerAuth).send({});
    expect(forbidden.status).toBe(403);
  });
});
