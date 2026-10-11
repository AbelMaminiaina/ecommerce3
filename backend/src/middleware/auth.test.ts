import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
// Vraie relecture du compte en base (simulée par défaut dans src/test/setup.ts)
vi.unmock('../lib/sessionUser.js');

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { authenticate, requirePlatformAdmin, requireApprovedCompany, requireCanOrder } from './auth.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticate', () => {
  it('rejects a request with no Authorization header', async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    const req = { headers: { authorization: 'Bearer not-a-token' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the user to req.user and calls next on a valid token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'buyer', companyId: 'c1', deletedAt: null } as any);
    const token = signToken({ userId: 'u1', role: 'buyer', companyId: 'c1' });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ userId: 'u1', role: 'buyer', companyId: 'c1' });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
  });

  it('refuse le jeton encore valide d’un compte supprimé', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'buyer', companyId: null, deletedAt: new Date() } as any);
    const token = signToken({ userId: 'u1', role: 'buyer', companyId: null });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuse le jeton d’un compte qui n’existe plus en base', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const token = signToken({ userId: 'disparu', role: 'platform_admin', companyId: null });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('applique le rôle et l’entreprise actuels, pas ceux du jeton (administrateur rétrogradé)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'buyer', companyId: 'c2', deletedAt: null } as any);
    const token = signToken({ userId: 'u1', role: 'platform_admin', companyId: null });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual({ userId: 'u1', role: 'buyer', companyId: 'c2' });
    const adminRes = mockRes();
    const adminNext = vi.fn();
    requirePlatformAdmin(req, adminRes, adminNext);
    expect(adminRes.status).toHaveBeenCalledWith(403);
    expect(adminNext).not.toHaveBeenCalled();
  });
});

describe('requirePlatformAdmin', () => {
  it('rejects a non-admin user', () => {
    const req = { user: { userId: 'u1', role: 'buyer', companyId: 'c1' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePlatformAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a platform_admin user', () => {
    const req = { user: { userId: 'u1', role: 'platform_admin', companyId: null } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePlatformAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireApprovedCompany', () => {
  it('rejects a user with no companyId', async () => {
    const req = { user: { userId: 'u1', role: 'platform_admin', companyId: null } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireApprovedCompany(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the company is not approved', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);
    const req = { user: { userId: 'u1', role: 'buyer', companyId: 'c1' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireApprovedCompany(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a user whose company is approved', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'approved' } as any);
    const req = { user: { userId: 'u1', role: 'buyer', companyId: 'c1' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireApprovedCompany(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireCanOrder', () => {
  it('allows a customer (particulier) without any company', async () => {
    const req = { user: { userId: 'u1', role: 'customer', companyId: null } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireCanOrder(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a user of a company that is not approved', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);
    const req = { user: { userId: 'u1', role: 'buyer', companyId: 'c1' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireCanOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a user of an approved company', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'approved' } as any);
    const req = { user: { userId: 'u1', role: 'buyer', companyId: 'c1' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    await requireCanOrder(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
