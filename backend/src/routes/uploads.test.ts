import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');

import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const adminAuth = { Authorization: `Bearer ${signToken({ userId: 'a1', role: 'platform_admin', companyId: null })}` };
const sellerAuth = { Authorization: `Bearer ${signToken({ userId: 'u1', role: 'company_admin', companyId: 'c1' })}` };
const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'u2', role: 'customer', companyId: null })}` };

// UPLOAD_DIR est lu au chargement : dossier temporaire, puis import de la route
let dir: string;
let app: express.Express;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-route-'));
  process.env.UPLOAD_DIR = dir;
  const { default: uploadsRouter } = await import('./uploads.js');
  app = express();
  app.use('/api/uploads', uploadsRouter);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  mockReset(prismaMock);
});

const jpeg = () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();

describe('POST /api/uploads', () => {
  it('enregistre l’image d’un administrateur et renvoie son URL', async () => {
    const res = await request(app).post('/api/uploads').set(adminAuth).attach('image', await jpeg(), 'photo.jpg');

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    await expect(fs.stat(path.join(dir, path.basename(res.body.url)))).resolves.toBeTruthy();
  });

  it('accepte une entreprise approuvée', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'approved' } as any);
    const res = await request(app).post('/api/uploads').set(sellerAuth).attach('image', await jpeg(), 'photo.jpg');
    expect(res.status).toBe(201);
  });

  it('refuse une entreprise non approuvée et un particulier', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);
    const pending = await request(app).post('/api/uploads').set(sellerAuth).attach('image', await jpeg(), 'photo.jpg');
    const customer = await request(app).post('/api/uploads').set(customerAuth).attach('image', await jpeg(), 'photo.jpg');

    expect(pending.status).toBe(403);
    expect(customer.status).toBe(403);
  });

  it('exige une connexion', async () => {
    const res = await request(app).post('/api/uploads').attach('image', await jpeg(), 'photo.jpg');
    expect(res.status).toBe(401);
  });

  it('refuse une requête sans image ou un fichier qui n’est pas une image', async () => {
    const empty = await request(app).post('/api/uploads').set(adminAuth);
    const notImage = await request(app)
      .post('/api/uploads')
      .set(adminAuth)
      .attach('image', Buffer.from('<svg onload="alert(1)"/>'), 'x.svg');

    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('Aucune image reçue');
    expect(notImage.status).toBe(400);
    expect(notImage.body.error).toMatch(/Fichier illisible|Format non supporté/);
  });
});
