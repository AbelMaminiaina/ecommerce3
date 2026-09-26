import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHash } from 'node:crypto';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({ invalidateProductCache: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { hashPassword, signToken, verifyToken } from '../lib/auth.js';
import authRouter from './auth.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(invalidateProductCache).mockClear();
  // Les transactions interactives exécutent la fonction avec le client simulé
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const REFRESH = 'r'.repeat(64);
const future = () => new Date(Date.now() + 86_400_000);

async function userRow(overrides: Partial<any> = {}) {
  return {
    id: 'u1',
    email: 'jean@exemple.mg',
    passwordHash: await hashPassword('secret123'),
    firstName: 'Jean',
    lastName: 'Rakoto',
    phone: '0340000000',
    role: 'customer',
    companyId: null,
    deletedAt: null,
    company: null,
    ...overrides,
  } as any;
}

describe('POST /api/auth/login (application mobile)', () => {
  it('renvoie aussi un jeton de renouvellement, stocké sous forme d’empreinte', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow());

    const res = await request(buildApp()).post('/api/auth/login').send({ email: 'jean@exemple.mg', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const stored = prismaMock.refreshToken.create.mock.calls[0][0].data as any;
    expect(stored.tokenHash).toBe(sha256(res.body.refreshToken));
    expect(stored.tokenHash).not.toContain(res.body.refreshToken);
  });
});

describe('POST /api/auth/refresh', () => {
  it('échange un jeton valide contre un nouveau jeton d’accès et un nouveau jeton de renouvellement', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null, expiresAt: future() } as any);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ role: 'buyer', companyId: 'c1' }));

    const res = await request(buildApp()).post('/api/auth/refresh').send({ refreshToken: REFRESH });

    expect(res.status).toBe(200);
    expect(verifyToken(res.body.token)).toMatchObject({ userId: 'u1', role: 'buyer', companyId: 'c1' });
    expect(res.body.refreshToken).not.toBe(REFRESH);
    // L'ancien jeton est révoqué (rotation)
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuse un jeton inconnu ou expiré', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(buildApp()).post('/api/auth/refresh').send({ refreshToken: REFRESH });

    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ id: 't1', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() - 1000) } as any);
    const expired = await request(buildApp()).post('/api/auth/refresh').send({ refreshToken: REFRESH });

    expect(unknown.status).toBe(401);
    expect(expired.status).toBe(401);
  });

  it('révoque toutes les sessions quand un jeton déjà utilisé revient (vol probable)', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: new Date(), expiresAt: future() } as any);

    const res = await request(buildApp()).post('/api/auth/refresh').send({ refreshToken: REFRESH });

    expect(res.status).toBe(401);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuse le renouvellement pour un compte supprimé', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null, expiresAt: future() } as any);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ deletedAt: new Date() }));

    const res = await request(buildApp()).post('/api/auth/refresh').send({ refreshToken: REFRESH });
    expect(res.status).toBe(401);
  });

  it('exige un jeton', async () => {
    const res = await request(buildApp()).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Jeton de renouvellement manquant');
  });
});

describe('POST /api/auth/logout', () => {
  it('révoque le jeton de renouvellement de l’appareil', async () => {
    const res = await request(buildApp()).post('/api/auth/logout').send({ refreshToken: REFRESH });

    expect(res.status).toBe(204);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256(REFRESH), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('DELETE /api/auth/me (suppression du compte)', () => {
  const auth = (role = 'customer', companyId: string | null = null) => ({
    Authorization: `Bearer ${signToken({ userId: 'u1', role: role as any, companyId })}`,
  });

  it('exige une connexion et le mot de passe', async () => {
    expect((await request(buildApp()).delete('/api/auth/me').send({ password: 'x' })).status).toBe(401);
    const noPassword = await request(buildApp()).delete('/api/auth/me').set(auth()).send({});
    expect(noPassword.status).toBe(400);
  });

  it('refuse un mauvais mot de passe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow());
    const res = await request(buildApp()).delete('/api/auth/me').set(auth()).send({ password: 'faux' });

    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('refuse la suppression d’un compte administrateur', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ role: 'platform_admin' }));
    const res = await request(buildApp()).delete('/api/auth/me').set(auth('platform_admin')).send({ password: 'secret123' });
    expect(res.status).toBe(403);
  });

  it('anonymise le compte, efface les adresses sans commande et ferme les sessions', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow());

    const res = await request(buildApp()).delete('/api/auth/me').set(auth()).send({ password: 'secret123' });

    expect(res.status).toBe(204);
    const update = prismaMock.user.update.mock.calls[0][0] as any;
    expect(update.data).toMatchObject({
      email: 'supprime-u1@compte-supprime.invalid',
      firstName: 'Compte',
      lastName: 'supprimé',
      phone: null,
      deletedAt: expect.any(Date),
    });
    expect(update.data.passwordHash).not.toBe((await userRow()).passwordHash);
    expect(prismaMock.address.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', orders: { none: {} } } });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
    // Un particulier n'a pas d'entreprise : rien d'autre n'est touché
    expect(prismaMock.company.update).not.toHaveBeenCalled();
  });

  it('dernier utilisateur d’une entreprise vendeuse : entreprise suspendue, produits retirés de la vente', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ role: 'company_admin', companyId: 'c1' }));
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.updateMany.mockResolvedValue({ count: 3 });

    const res = await request(buildApp()).delete('/api/auth/me').set(auth('company_admin', 'c1')).send({ password: 'secret123' });

    expect(res.status).toBe(204);
    expect(prismaMock.company.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'suspended' } });
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
      where: { sellerId: 'c1', isActive: true },
      data: { isActive: false },
    });
    expect(invalidateProductCache).toHaveBeenCalled();
  });

  it('entreprise avec d’autres utilisateurs : elle reste active', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ role: 'buyer', companyId: 'c1' }));
    prismaMock.user.count.mockResolvedValue(2);

    const res = await request(buildApp()).delete('/api/auth/me').set(auth('buyer', 'c1')).send({ password: 'secret123' });

    expect(res.status).toBe(204);
    expect(prismaMock.company.update).not.toHaveBeenCalled();
  });

  it('un compte supprimé n’est plus renvoyé par GET /me', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await userRow({ deletedAt: new Date() }));
    const res = await request(buildApp()).get('/api/auth/me').set(auth());
    expect(res.status).toBe(404);
  });
});
