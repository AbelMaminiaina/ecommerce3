import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./emailService.js', () => ({
  sendOrderCancellationEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { sendOrderCancellationEmail } from './emailService.js';
import { expireUnpaidOrders, orderExpiryJob } from './orderExpiry.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const NOW = new Date('2026-09-22T12:00:00Z');
const original = process.env.UNPAID_ORDER_EXPIRY_HOURS;

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendOrderCancellationEmail).mockClear();
  vi.mocked(invalidateProductCache).mockClear();
  delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
  prismaMock.product.update.mockResolvedValue({} as any);
});
afterEach(() => {
  if (original === undefined) delete process.env.UNPAID_ORDER_EXPIRY_HOURS;
  else process.env.UNPAID_ORDER_EXPIRY_HOURS = original;
});

const order = (overrides: Partial<any> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  stockReserved: true,
  total: 150_000,
  guestName: 'Rakoto Jean',
  guestEmail: 'jean@example.mg',
  company: null,
  user: null,
  items: [
    { productId: 'p1', quantity: 10, price: 15_000, availableFrom: null, product: { name: 'Produit 1' } },
    { productId: 'p2', quantity: 2, price: 5_000, availableFrom: null, product: { name: 'Produit 2' } },
  ],
  ...overrides,
});

describe('expireUnpaidOrders', () => {
  it('cherche les commandes en attente non payées dont le délai (48 h) est dépassé', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    await expireUnpaidOrders(NOW);

    const where = (prismaMock.order.findMany.mock.calls[0][0] as any).where;
    const cutoff = new Date('2026-09-20T12:00:00Z');
    expect(where.status).toBe('pending');
    expect(where.OR).toEqual([
      { paymentStatus: 'awaiting', createdAt: { lt: cutoff } },
      { paymentStatus: 'rejected', updatedAt: { lt: cutoff } }, // paiement refusé : délai compté depuis le refus
    ]);
  });

  it("ne cherche jamais une commande dont le client a transmis une référence (« submitted ») ni une commande payée", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    await expireUnpaidOrders(NOW);

    const statuses = ((prismaMock.order.findMany.mock.calls[0][0] as any).where.OR as any[]).map((c) => c.paymentStatus);
    expect(statuses).toEqual(['awaiting', 'rejected']);
  });

  it('annule la commande, restitue le stock réservé et prévient le client', async () => {
    prismaMock.order.findMany.mockResolvedValue([order()] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual(['ORD-1']);
    const claim = prismaMock.order.updateMany.mock.calls[0][0] as any;
    expect(claim.data).toMatchObject({ status: 'cancelled', cancelReason: 'Non payée dans le délai imparti', stockReserved: false });
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: 10 }, inStock: true },
    });
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { stockQuantity: { increment: 2 }, inStock: true },
    });
    expect(invalidateProductCache).toHaveBeenCalledTimes(1);
    expect(sendOrderCancellationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'ORD-1',
        contactEmail: 'jean@example.mg',
        companyName: 'Rakoto Jean',
        reason: 'Non payée dans le délai imparti',
        total: 150_000,
        items: [expect.objectContaining({ name: 'Produit 1', quantity: 10 }), expect.objectContaining({ name: 'Produit 2' })],
      })
    );
  });

  it("réclame la commande de façon conditionnelle (toujours en attente et non payée) pour ne jamais annuler une commande payée entre-temps", async () => {
    prismaMock.order.findMany.mockResolvedValue([order()] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    await expireUnpaidOrders(NOW);

    expect((prismaMock.order.updateMany.mock.calls[0][0] as any).where).toEqual({
      id: 'o1',
      status: 'pending',
      paymentStatus: { in: ['awaiting', 'rejected'] },
    });
  });

  it("ne touche à rien si la commande a été payée / traitée entre la recherche et l'annulation", async () => {
    prismaMock.order.findMany.mockResolvedValue([order()] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 } as any);

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual([]);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(sendOrderCancellationEmail).not.toHaveBeenCalled();
    expect(invalidateProductCache).not.toHaveBeenCalled();
  });

  it("ne restitue pas de stock quand aucun stock n'avait été réservé (rupture à la commande)", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ stockReserved: false })] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual(['ORD-1']);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(invalidateProductCache).not.toHaveBeenCalled();
  });

  it("écrit au compte connecté (entreprise ou particulier) quand il n'y a pas d'e-mail invité", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: 'o2', orderNumber: 'ORD-2', guestEmail: null, guestName: null, company: { name: 'Grossiste', contactEmail: 'g@example.mg' } }),
      order({ id: 'o3', orderNumber: 'ORD-3', guestEmail: null, guestName: null, user: { firstName: 'Marie', lastName: 'R', email: 'm@example.mg' } }),
    ] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    await expireUnpaidOrders(NOW);

    const emails = vi.mocked(sendOrderCancellationEmail).mock.calls.map((c) => [c[0].contactEmail, c[0].companyName]);
    expect(emails).toEqual([['g@example.mg', 'Grossiste'], ['m@example.mg', 'Marie R']]);
  });

  it("annule quand même la commande s'il n'y a aucune adresse e-mail où prévenir", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ guestEmail: null })] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as any);

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual(['ORD-1']);
    expect(sendOrderCancellationEmail).not.toHaveBeenCalled();
  });

  it('traite plusieurs commandes indépendamment (une déjà payée, une annulée)', async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ id: 'a', orderNumber: 'ORD-A' }), order({ id: 'b', orderNumber: 'ORD-B' })] as any);
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 0 } as any).mockResolvedValueOnce({ count: 1 } as any);

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual(['ORD-B']);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(2); // uniquement pour ORD-B
  });

  it("respecte le délai configuré (UNPAID_ORDER_EXPIRY_HOURS)", async () => {
    process.env.UNPAID_ORDER_EXPIRY_HOURS = '24';
    prismaMock.order.findMany.mockResolvedValue([]);

    await expireUnpaidOrders(NOW);

    const cutoff = ((prismaMock.order.findMany.mock.calls[0][0] as any).where.OR[0].createdAt as any).lt as Date;
    expect(cutoff).toEqual(new Date('2026-09-21T12:00:00Z'));
  });

  it('ne fait rien quand l\'annulation automatique est désactivée (0)', async () => {
    process.env.UNPAID_ORDER_EXPIRY_HOURS = '0';

    const result = await expireUnpaidOrders(NOW);

    expect(result.cancelled).toEqual([]);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('orderExpiryJob', () => {
  it('planifie la vérification toutes les 10 minutes', () => {
    const job = orderExpiryJob();
    expect(job).toMatchObject({ name: 'order-expiry', everyMs: 10 * 60 * 1000 });
  });

  it('aucune tâche quand l’annulation automatique est désactivée (0 h)', () => {
    process.env.UNPAID_ORDER_EXPIRY_HOURS = '0';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(orderExpiryJob()).toBeNull();
    log.mockRestore();
  });
});
