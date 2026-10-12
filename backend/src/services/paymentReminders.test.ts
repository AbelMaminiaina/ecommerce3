import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('./emailService.js', () => ({
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { sendPaymentReminderEmail } from './emailService.js';
import { paymentReminderJob, sendPaymentReminders } from './paymentReminders.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const H = 60 * 60 * 1000;
const NOW = new Date('2026-10-13T12:00:00Z');
const KEYS = ['UNPAID_ORDER_EXPIRY_HOURS', 'PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY', 'PUBLIC_SITE_URL'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendPaymentReminderEmail).mockClear();
  KEYS.forEach((k) => delete process.env[k]);
  process.env.PUBLIC_SITE_URL = 'https://tsena.mg';
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  vi.mocked(console.log).mockRestore();
});

// Par défaut : annulation à 48 h, rappel 12 h avant → rappel dû 36 h après la commande
const order = (overrides: Partial<any> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  checkoutGroup: null,
  status: 'pending',
  paymentStatus: 'awaiting',
  createdAt: new Date(NOW.getTime() - 40 * H),
  updatedAt: new Date(NOW.getTime() - 40 * H),
  total: 100_000,
  guestName: null,
  guestEmail: null,
  company: { name: 'Épicerie Rasoa', contactEmail: 'rasoa@example.com', contactPhone: null },
  user: null,
  ...overrides,
});

describe('sendPaymentReminders', () => {
  it('cherche les commandes non payées dont le rappel est dû et pas encore envoyé', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    await sendPaymentReminders(NOW);

    const where = prismaMock.order.findMany.mock.calls[0][0]!.where as any;
    expect(where).toMatchObject({ status: 'pending', paymentReminderSentAt: null });
    expect(where.OR[0]).toEqual({ paymentStatus: 'awaiting', createdAt: { lte: new Date(NOW.getTime() - 36 * H) } });
  });

  it('envoie le rappel avec la date d’annulation et le lien de suivi', async () => {
    prismaMock.order.findMany.mockResolvedValue([order()] as any);
    const result = await sendPaymentReminders(NOW);

    expect(result.reminded).toEqual(['ORD-1']);
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['o1'] }, paymentReminderSentAt: null },
      data: { paymentReminderSentAt: NOW },
    });
    expect(sendPaymentReminderEmail).toHaveBeenCalledWith({
      orderNumbers: ['ORD-1'],
      companyName: 'Épicerie Rasoa',
      contactEmail: 'rasoa@example.com',
      totalAmount: 100_000,
      expiresAt: new Date(NOW.getTime() + 8 * H),
      trackingUrl: 'https://tsena.mg/suivi-commande?order=ORD-1&email=rasoa%40example.com',
    });
  });

  it('un seul rappel pour un panier multi-vendeurs', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: 'o1', orderNumber: 'ORD-1', checkoutGroup: 'g1', total: 60_000 }),
      order({ id: 'o2', orderNumber: 'ORD-2', checkoutGroup: 'g1', total: 40_000 }),
    ] as any);
    await sendPaymentReminders(NOW);

    expect(prismaMock.order.updateMany).toHaveBeenCalledTimes(1);
    expect(sendPaymentReminderEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPaymentReminderEmail).mock.calls[0][0]).toMatchObject({
      orderNumbers: ['ORD-1', 'ORD-2'],
      totalAmount: 100_000,
    });
  });

  it('commande invitée : rappel à l’adresse saisie au paiement', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ company: null, guestName: 'Rakoto Jean', guestEmail: 'rakoto@example.com' }),
    ] as any);
    await sendPaymentReminders(NOW);
    expect(vi.mocked(sendPaymentReminderEmail).mock.calls[0][0]).toMatchObject({
      companyName: 'Rakoto Jean',
      contactEmail: 'rakoto@example.com',
    });
  });

  it('pas de rappel une fois le délai dépassé (l’annulation s’en charge)', async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ createdAt: new Date(NOW.getTime() - 50 * H) })] as any);
    const result = await sendPaymentReminders(NOW);
    expect(result.reminded).toEqual([]);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('pas de second envoi si une autre passe a déjà réclamé la commande', async () => {
    prismaMock.order.findMany.mockResolvedValue([order()] as any);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const result = await sendPaymentReminders(NOW);
    expect(result.reminded).toEqual([]);
    expect(sendPaymentReminderEmail).not.toHaveBeenCalled();
  });

  it('désactivé : ne lit même pas la base', async () => {
    process.env.PAYMENT_REMINDER_HOURS_BEFORE_EXPIRY = '0';
    expect(await sendPaymentReminders(NOW)).toEqual({ reminded: [] });
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    expect(paymentReminderJob()).toBeNull();
  });
});

describe('paymentReminderJob', () => {
  it('toutes les 15 minutes', () => {
    expect(paymentReminderJob()).toMatchObject({ name: 'payment-reminder', everyMs: 15 * 60 * 1000 });
  });

  it('aucune tâche si l’annulation automatique est désactivée', () => {
    process.env.UNPAID_ORDER_EXPIRY_HOURS = '0';
    expect(paymentReminderJob()).toBeNull();
  });
});
