import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
// Limiteur de débit réel, sauf quand TEST_NO_LIMIT est posé (les tests enchaînent bien plus que 10 demandes)
vi.mock('../lib/rateLimit.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/rateLimit.js')>('../lib/rateLimit.js');
  return {
    rateLimit: (options: Parameters<typeof actual.rateLimit>[0]) => {
      const real = actual.rateLimit(options);
      return (req: any, res: any, next: any) => (process.env.TEST_NO_LIMIT ? next() : real(req, res, next));
    },
  };
});
vi.mock('../services/mobileMoneyPayments.js', async () => {
  const actual = await vi.importActual<typeof import('../services/mobileMoneyPayments.js')>('../services/mobileMoneyPayments.js');
  return {
    PaymentHttpError: actual.PaymentHttpError,
    initiateAutoPayment: vi.fn(),
    reconcileAttempt: vi.fn(),
    handleOperatorCallback: vi.fn(),
  };
});

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { PaymentHttpError, handleOperatorCallback, initiateAutoPayment, reconcileAttempt } from '../services/mobileMoneyPayments.js';
import autoRouter from './autoPayments.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const buyerAuth = { Authorization: `Bearer ${signToken({ userId: 'buyer1', role: 'buyer', companyId: 'c1' })}` };
const otherAuth = { Authorization: `Bearer ${signToken({ userId: 'buyer2', role: 'buyer', companyId: 'c2' })}` };

beforeEach(() => {
  process.env.TEST_NO_LIMIT = '1';
  mockReset(prismaMock);
  vi.mocked(initiateAutoPayment).mockReset();
  vi.mocked(reconcileAttempt).mockReset();
  vi.mocked(handleOperatorCallback).mockReset();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payments/auto', autoRouter);
  return app;
}

const order = (overrides: Partial<any> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  checkoutGroup: 'g1',
  status: 'pending',
  paymentStatus: 'awaiting',
  paymentMethod: 'mvola',
  total: 100_000,
  companyId: null,
  userId: null,
  guestEmail: 'jean@example.mg',
  seller: null,
  ...overrides,
});
const attempt = (overrides: Partial<any> = {}) => ({
  id: 'att-1',
  provider: 'mvola',
  status: 'pending',
  failureReason: null,
  paymentUrl: null,
  payerPhone: '0343500003',
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
  serverCorrelationId: 'secret-correlation-id',
  transactionId: 'secret-tx',
  amount: 100_000,
  ...overrides,
});

function mockGroup(overrides: Partial<any> = {}) {
  prismaMock.order.findUnique.mockResolvedValue(order(overrides) as any);
  prismaMock.order.findMany.mockResolvedValue([order(overrides)] as any);
}

describe('POST /api/payments/auto/initiate', () => {
  const body = { orderNumber: 'ORD-1', email: 'jean@example.mg', payerPhone: '034 35 000 03' };

  it('lance la demande pour le visiteur qui a passé la commande (202) sans exposer les identifiants internes', async () => {
    mockGroup();
    vi.mocked(initiateAutoPayment).mockResolvedValue({ attempt: attempt() as any, reused: false });

    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(body);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, reused: false, attempt: { id: 'att-1', status: 'pending', payerPhone: '0343500003' } });
    expect(res.body.message).toContain('confirmez');
    expect(JSON.stringify(res.body)).not.toContain('secret-correlation-id');
    expect(JSON.stringify(res.body)).not.toContain('secret-tx');
    expect(vi.mocked(initiateAutoPayment).mock.calls[0][0].payerPhone).toBe('034 35 000 03');
  });

  it('répond 404 pour un mauvais e-mail, sans révéler que la commande existe', async () => {
    mockGroup();

    const res = await request(buildApp()).post('/api/payments/auto/initiate').send({ ...body, email: 'autre@example.mg' });

    expect(res.status).toBe(404);
    expect(initiateAutoPayment).not.toHaveBeenCalled();
  });

  it('répond 404 pour une commande inconnue', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(body);
    expect(res.status).toBe(404);
  });

  it('accepte le propriétaire connecté mais refuse une autre entreprise', async () => {
    mockGroup({ guestEmail: null, companyId: 'c1' });
    vi.mocked(initiateAutoPayment).mockResolvedValue({ attempt: attempt() as any, reused: false });

    const owner = await request(buildApp()).post('/api/payments/auto/initiate').set(buyerAuth).send({ orderNumber: 'ORD-1', payerPhone: '0343500003' });
    const other = await request(buildApp()).post('/api/payments/auto/initiate').set(otherAuth).send({ orderNumber: 'ORD-1', payerPhone: '0343500003' });

    expect(owner.status).toBe(202);
    expect(other.status).toBe(404);
  });

  it.each([
    ['numéro démesuré', { ...body, payerPhone: '3'.repeat(40) }],
    ['e-mail invalide', { ...body, email: 'pas-un-email' }],
    ['commande manquante', { payerPhone: '0343500003' }],
  ])('valide la saisie (%s)', async (_label, payload) => {
    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(payload);
    expect(res.status).toBe(400);
    expect(initiateAutoPayment).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'Numéro MVola invalide'],
    [409, 'Cette commande est déjà payée.'],
    [429, 'Trop de tentatives'],
    [502, 'MVola a refusé'],
    [503, 'MVola est momentanément indisponible'],
  ])('transmet l’erreur métier %i au client avec un message lisible', async (status, message) => {
    mockGroup();
    vi.mocked(initiateAutoPayment).mockRejectedValue(new PaymentHttpError(status, message));

    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(body);

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ success: false, error: message });
  });

  it('répond 500 générique (sans détail interne) sur une erreur inattendue', async () => {
    mockGroup();
    vi.mocked(initiateAutoPayment).mockRejectedValue(new Error('connexion à la base perdue : mot de passe xyz'));

    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(body);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('xyz');
  });
});

describe('limitation de débit (chaque demande fait sonner un téléphone)', () => {
  it('bloque au-delà de 10 demandes par adresse IP et par 15 minutes, avant tout appel à MVola', async () => {
    delete process.env.TEST_NO_LIMIT;
    mockGroup();
    vi.mocked(initiateAutoPayment).mockResolvedValue({ attempt: attempt() as any, reused: false });
    const app = buildApp();
    const body = { orderNumber: 'ORD-1', email: 'jean@example.mg', payerPhone: '0343500003' };

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await request(app).post('/api/payments/auto/initiate').send(body)).status);

    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(initiateAutoPayment).toHaveBeenCalledTimes(10);
  });
});

describe('POST /api/payments/auto/initiate (Orange Money : redirection)', () => {
  const orangeBody = { orderNumber: 'ORD-1', email: 'jean@example.mg' };
  const orangeAttempt = (overrides: Partial<any> = {}) =>
    attempt({ provider: 'orange_money', payerPhone: '', paymentUrl: 'https://webpayment.orange.example/pay/abc', ...overrides });

  it('accepte une demande sans numéro et renvoie la page de paiement d’Orange, sans exposer le pay_token', async () => {
    mockGroup({ paymentMethod: 'orange_money' });
    vi.mocked(initiateAutoPayment).mockResolvedValue({ attempt: orangeAttempt({ serverCorrelationId: 'secret-pay-token', notifToken: 'secret-notif' }) as any, reused: false });

    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(orangeBody);

    expect(res.status).toBe(202);
    expect(res.body.attempt).toMatchObject({ provider: 'orange_money', status: 'pending', paymentUrl: 'https://webpayment.orange.example/pay/abc' });
    expect(res.body.message).toContain('Orange Money');
    expect(res.body.message).not.toContain('téléphone');
    expect(JSON.stringify(res.body)).not.toContain('secret-pay-token');
    expect(JSON.stringify(res.body)).not.toContain('secret-notif');
    expect(vi.mocked(initiateAutoPayment).mock.calls[0][0].payerPhone).toBeUndefined();
  });

  it('transmet l’erreur de numéro décidée par le service (MVola et Airtel exigent un numéro)', async () => {
    mockGroup();
    vi.mocked(initiateAutoPayment).mockRejectedValue(new PaymentHttpError(400, 'Numéro MVola invalide : il doit commencer par 034 ou 038.'));
    const res = await request(buildApp()).post('/api/payments/auto/initiate').send(orangeBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('034 ou 038');
  });

  it('indique le téléphone pour Airtel Money', async () => {
    mockGroup({ paymentMethod: 'airtel_money' });
    vi.mocked(initiateAutoPayment).mockResolvedValue({ attempt: attempt({ provider: 'airtel_money', payerPhone: '0331234567' }) as any, reused: false });
    const res = await request(buildApp()).post('/api/payments/auto/initiate').send({ ...orangeBody, payerPhone: '033 12 345 67' });
    expect(res.status).toBe(202);
    expect(res.body.message).toContain('Airtel Money');
    expect(res.body.message).toContain('téléphone');
    expect(res.body.attempt.paymentUrl).toBeNull();
  });
});

describe('GET /api/payments/auto/attempt/:id', () => {
  function mockAttempt(overrides: Partial<any> = {}) {
    prismaMock.paymentAttempt.findUnique.mockResolvedValue(attempt(overrides) as any);
    prismaMock.order.findUnique.mockResolvedValue(order() as any);
  }

  it('vérifie auprès de MVola à chaque appel et renvoie l’état à jour', async () => {
    mockAttempt();
    vi.mocked(reconcileAttempt).mockResolvedValue(attempt({ status: 'completed' }) as any);

    const res = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'att-1', status: 'completed' });
    expect(reconcileAttempt).toHaveBeenCalledWith('att-1');
    expect(JSON.stringify(res.body)).not.toContain('secret-correlation-id');
  });

  it('répond « en cours » tant que les commandes ne sont pas réglées, même si MVola a confirmé (pas d’affichage périmé)', async () => {
    mockAttempt();
    prismaMock.order.findMany.mockResolvedValue([{ status: 'pending', paymentStatus: 'submitted' }] as any);
    vi.mocked(reconcileAttempt).mockResolvedValue(attempt({ status: 'completed', updatedAt: new Date() }) as any);

    const res = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');

    expect(res.body.status).toBe('pending');
  });

  it('répond « completed » une fois les commandes payées', async () => {
    mockAttempt();
    prismaMock.order.findMany.mockResolvedValue([{ status: 'processing', paymentStatus: 'paid' }] as any);
    vi.mocked(reconcileAttempt).mockResolvedValue(attempt({ status: 'completed', updatedAt: new Date() }) as any);

    const res = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');

    expect(res.body.status).toBe('completed');
  });

  it('ne renvoie l’adresse de la page Orange que tant que la demande est en cours', async () => {
    const url = 'https://webpayment.orange.example/pay/abc';
    mockAttempt({ provider: 'orange_money', paymentUrl: url });
    vi.mocked(reconcileAttempt).mockResolvedValueOnce(attempt({ provider: 'orange_money', paymentUrl: url }) as any);
    const pending = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');
    expect(pending.body.paymentUrl).toBe(url);

    vi.mocked(reconcileAttempt).mockResolvedValueOnce(attempt({ provider: 'orange_money', paymentUrl: url, status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur Orange Money' }) as any);
    const failed = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');
    expect(failed.body).toMatchObject({ status: 'failed', paymentUrl: null });
  });

  it('renvoie le motif d’un échec', async () => {
    mockAttempt();
    vi.mocked(reconcileAttempt).mockResolvedValue(attempt({ status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur MVola' }) as any);

    const res = await request(buildApp()).get('/api/payments/auto/attempt/att-1?email=jean@example.mg');

    expect(res.body).toMatchObject({ status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur MVola' });
  });

  it.each([
    ['sans e-mail', '/api/payments/auto/attempt/att-1'],
    ['avec un e-mail qui n’est pas celui de la commande', '/api/payments/auto/attempt/att-1?email=autre@example.mg'],
  ])('répond 404 %s (aucune fuite entre clients)', async (_label, url) => {
    mockAttempt();
    const res = await request(buildApp()).get(url);
    expect(res.status).toBe(404);
    expect(reconcileAttempt).not.toHaveBeenCalled();
  });

  it('répond 404 pour une tentative inconnue', async () => {
    prismaMock.paymentAttempt.findUnique.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/payments/auto/attempt/nope?email=jean@example.mg');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/auto/callback/:provider', () => {
  it.each(['orange_money', 'airtel_money'])('délègue le message de %s avec le bon opérateur', async (provider) => {
    vi.mocked(handleOperatorCallback).mockResolvedValue(true);
    const payload = { notif_token: 'abc', status: 'SUCCESS' };
    const res = await request(buildApp()).post(`/api/payments/auto/callback/${provider}`).send(payload);
    expect(res.status).toBe(200);
    expect(handleOperatorCallback).toHaveBeenCalledWith(provider, payload);
  });

  it('ignore (200) un opérateur inconnu sans rien vérifier', async () => {
    const res = await request(buildApp()).post('/api/payments/auto/callback/inconnu').send({ x: 1 });
    expect(res.status).toBe(200);
    expect(handleOperatorCallback).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/auto/callback/mvola', () => {
  it('répond toujours 200, sans authentification, et délègue la vérification', async () => {
    vi.mocked(handleOperatorCallback).mockResolvedValue(true);
    const payload = { serverCorrelationId: 'abc', transactionStatus: 'completed' };

    const res = await request(buildApp()).post('/api/payments/auto/callback/mvola').send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(handleOperatorCallback).toHaveBeenCalledWith('mvola', payload);
  });

  it('répond 200 même pour une tentative inconnue (MVola n’a pas à le savoir)', async () => {
    vi.mocked(handleOperatorCallback).mockResolvedValue(false);
    const res = await request(buildApp()).post('/api/payments/auto/callback/mvola').send({ serverCorrelationId: 'inconnue' });
    expect(res.status).toBe(200);
  });

  it('répond 200 même si le traitement échoue (pas de fuite d’erreur interne)', async () => {
    vi.mocked(handleOperatorCallback).mockRejectedValue(new Error('base indisponible'));
    const res = await request(buildApp()).post('/api/payments/auto/callback/mvola').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
