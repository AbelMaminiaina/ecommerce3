import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('./emailService.js', () => ({
  sendLateShipmentEmail: vi.fn().mockResolvedValue(true),
  sendLowStockEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { sendLateShipmentEmail, sendLowStockEmail } from './emailService.js';
import { alertLateShipments, alertLowStock, lateShipmentJob, lowStockJob } from './sellerAlerts.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const H = 60 * 60 * 1000;
const NOW = new Date('2026-10-13T12:00:00Z');
const KEYS = ['SELLER_SHIPPING_ALERT_HOURS', 'LOW_STOCK_THRESHOLD', 'PUBLIC_SITE_URL'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const SELLER = { name: 'Ferme Andry', contactEmail: 'andry@example.com' };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendLateShipmentEmail).mockClear();
  vi.mocked(sendLowStockEmail).mockClear();
  KEYS.forEach((k) => delete process.env[k]);
  process.env.PUBLIC_SITE_URL = 'https://tsena.mg';
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  vi.mocked(console.log).mockRestore();
});

const paidOrder = (overrides: Partial<any> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  sellerId: 's1',
  seller: SELLER,
  status: 'processing',
  paidAt: new Date(NOW.getTime() - 50 * H),
  total: 80_000,
  items: [{ availableFrom: null }],
  ...overrides,
});

describe('alertLateShipments', () => {
  it('cherche les commandes payées non expédiées, pas encore signalées, payées depuis plus de 48 h', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    await alertLateShipments(NOW);
    expect(prismaMock.order.findMany.mock.calls[0][0]!.where).toEqual({
      paymentStatus: 'paid',
      status: { in: ['pending', 'confirmed', 'processing'] },
      shippingAlertSentAt: null,
      paidAt: { lte: new Date(NOW.getTime() - 48 * H) },
    });
  });

  it('alerte le vendeur et envoie le récapitulatif à l’administrateur', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      paidOrder(),
      paidOrder({ id: 'o2', orderNumber: 'ORD-2', sellerId: null, seller: null }),
    ] as any);
    const result = await alertLateShipments(NOW);

    expect(result.alerted).toEqual(['ORD-1', 'ORD-2']);
    const calls = vi.mocked(sendLateShipmentEmail).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      recipientName: 'Ferme Andry',
      contactEmail: 'andry@example.com',
      manageUrl: 'https://tsena.mg/vendeur/commandes',
      orders: [{ orderNumber: 'ORD-1', total: 80_000, dueAt: new Date(NOW.getTime() - 2 * H) }],
    });
    expect(calls[1].contactEmail).toBeUndefined(); // administrateur
    expect(calls[1].manageUrl).toBe('https://tsena.mg/admin/commandes');
    expect(calls[1].orders.map((o) => [o.orderNumber, o.sellerName])).toEqual([
      ['ORD-1', 'Ferme Andry'],
      ['ORD-2', undefined],
    ]);
  });

  it('précommande pas encore disponible depuis 48 h : pas d’alerte', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      paidOrder({ items: [{ availableFrom: new Date(NOW.getTime() - 10 * H) }] }),
    ] as any);
    expect((await alertLateShipments(NOW)).alerted).toEqual([]);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(sendLateShipmentEmail).not.toHaveBeenCalled();
  });

  it('commande expédiée ou signalée entre-temps : ignorée', async () => {
    prismaMock.order.findMany.mockResolvedValue([paidOrder()] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    expect((await alertLateShipments(NOW)).alerted).toEqual([]);
    expect(sendLateShipmentEmail).not.toHaveBeenCalled();
  });

  it('désactivée à 0', async () => {
    process.env.SELLER_SHIPPING_ALERT_HOURS = '0';
    expect(await alertLateShipments(NOW)).toEqual({ alerted: [] });
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    expect(lateShipmentJob()).toBeNull();
  });
});

const product = (overrides: Partial<any> = {}) => ({
  id: 'p1',
  name: 'Œufs frais (plateau de 30)',
  stockQuantity: 2,
  moq: 1,
  unit: 'plateau',
  sellerId: 's1',
  seller: SELLER,
  ...overrides,
});

describe('alertLowStock', () => {
  it('réarme les produits réapprovisionnés', async () => {
    prismaMock.product.findMany
      .mockResolvedValueOnce([
        { id: 'p-ok', stockQuantity: 20, moq: 1 },
        { id: 'p-still-low', stockQuantity: 1, moq: 1 },
      ] as any)
      .mockResolvedValueOnce([]);
    const result = await alertLowStock(NOW);

    expect(result.rearmed).toBe(1);
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-ok'] } },
      data: { lowStockAlertAt: null },
    });
  });

  it('une alerte par vendeur ; produits de la plateforme à l’administrateur', async () => {
    prismaMock.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        product(),
        product({ id: 'p2', name: 'Poulet gasy', stockQuantity: 0, sellerId: null, seller: null }),
        product({ id: 'p3', name: 'Provende', stockQuantity: 30, moq: 50 }), // sous le minimum de commande
        product({ id: 'p4', name: 'Cailles', stockQuantity: 8 }), // au-dessus du seuil
      ] as any);
    const result = await alertLowStock(NOW);

    expect(result.alerted).toEqual(['Œufs frais (plateau de 30)', 'Poulet gasy', 'Provende']);
    const calls = vi.mocked(sendLowStockEmail).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      recipientName: 'Ferme Andry',
      contactEmail: 'andry@example.com',
      manageUrl: 'https://tsena.mg/vendeur/produits',
    });
    expect(calls[0].products.map((p) => p.name)).toEqual(['Œufs frais (plateau de 30)', 'Provende']);
    expect(calls[1]).toMatchObject({ contactEmail: undefined, manageUrl: 'https://tsena.mg/admin/stocks' });
  });

  it('ignore les produits inactifs, non approuvés et en précommande', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    await alertLowStock(NOW);
    expect(prismaMock.product.findMany.mock.calls[1][0]!.where).toMatchObject({
      lowStockAlertAt: null,
      isActive: true,
      status: 'approved',
      OR: [{ stockQuantity: { lt: 5 } }, { moq: { gt: 5 } }],
      AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: NOW } }] }],
    });
  });

  it('désactivée à 0', async () => {
    process.env.LOW_STOCK_THRESHOLD = '0';
    expect(await alertLowStock(NOW)).toEqual({ alerted: [], rearmed: 0 });
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(lowStockJob()).toBeNull();
  });
});

describe('tâches', () => {
  it('toutes les 30 minutes', () => {
    expect(lateShipmentJob()).toMatchObject({ name: 'late-shipment-alert', everyMs: 30 * 60 * 1000 });
    expect(lowStockJob()).toMatchObject({ name: 'low-stock-alert', everyMs: 30 * 60 * 1000 });
  });
});
