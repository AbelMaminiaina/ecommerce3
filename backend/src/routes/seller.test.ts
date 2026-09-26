import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/uploads.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/uploads.js')>()),
  deleteUploadedImages: vi.fn().mockResolvedValue(undefined),
  deleteReplacedImages: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { deleteUploadedImages } from '../lib/uploads.js';
import { signToken } from '../lib/auth.js';
import { MIN_WHOLESALE_QTY } from '../lib/wholesale.js';
import sellerRouter from './seller.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const sellerAuth = { Authorization: `Bearer ${signToken({ userId: 'u1', role: 'company_admin', companyId: 'c1' })}` };
const customerAuth = { Authorization: `Bearer ${signToken({ userId: 'u2', role: 'customer', companyId: null })}` };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(invalidateProductCache).mockClear();
  prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'approved' } as any);
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/seller', sellerRouter);
  return app;
}

const validProduct = {
  name: 'Smartphone pro',
  description: 'Un smartphone destiné aux revendeurs.',
  shortDescription: 'Smartphone pro',
  category: 'mobiles',
  price: 1000000,
  images: ['/img/a.png'],
  characteristics: ['Écran 6 pouces'],
  moq: MIN_WHOLESALE_QTY,
  unit: 'pièce',
  stockQuantity: 100,
  priceTiers: [{ minQty: 50, unitPrice: 900000 }],
};

describe('accès à l’espace vendeur', () => {
  it('exige une authentification', async () => {
    const res = await request(buildApp()).get('/api/seller/products');
    expect(res.status).toBe(401);
  });

  it('refuse un particulier (pas d’entreprise)', async () => {
    const res = await request(buildApp()).get('/api/seller/products').set(customerAuth);
    expect(res.status).toBe(403);
  });

  it('refuse une entreprise non approuvée', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'c1', status: 'pending' } as any);
    const res = await request(buildApp()).get('/api/seller/products').set(sellerAuth);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/seller/products', () => {
  beforeEach(() => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat1', slug: 'mobiles' } as any);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p1', category: 'mobiles', priceTiers: [] } as any);
  });

  it('crée un produit en attente de validation, rattaché à l’entreprise', async () => {
    const res = await request(buildApp()).post('/api/seller/products').set(sellerAuth).send(validProduct);

    expect(res.status).toBe(201);
    const data = (prismaMock.product.create.mock.calls[0][0] as any).data;
    expect(data).toMatchObject({ sellerId: 'c1', status: 'pending', category: 'mobiles', inStock: true });
    expect(data.slug).toMatch(/^smartphone-pro-[0-9a-f]{6}$/);
    expect(data.priceTiers).toEqual({ create: validProduct.priceTiers });
  });

  it('refuse une quantité minimum sous le plancher de vente en gros', async () => {
    const res = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, moq: MIN_WHOLESALE_QTY - 1, priceTiers: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Vente en gros');
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('refuse un palier qui ne commence pas au-dessus de la quantité minimum', async () => {
    const res = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, priceTiers: [{ minQty: MIN_WHOLESALE_QTY, unitPrice: 900000 }] });

    expect(res.status).toBe(400);
  });

  it('refuse un palier plus cher que le prix de base', async () => {
    const res = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, priceTiers: [{ minQty: 50, unitPrice: 1000000 }] });

    expect(res.status).toBe(400);
  });

  it('refuse une image intégrée en base64 : les photos passent par POST /api/uploads', async () => {
    const res = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, images: ['data:image/png;base64,iVBORw0KGgo='] });

    expect(res.status).toBe(400);
  });

  it('refuse une image SVG (exécutable) ou d’origine inconnue', async () => {
    const svg = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, images: ['data:image/svg+xml;base64,PHN2Zz4='] });
    const http = await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, images: ['javascript:alert(1)'] });

    expect(svg.status).toBe(400);
    expect(http.status).toBe(400);
  });

  it('refuse une catégorie inconnue', async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);
    const res = await request(buildApp()).post('/api/seller/products').set(sellerAuth).send(validProduct);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Catégorie inconnue');
  });

  it('ignore un statut ou un vendeur envoyés par le client', async () => {
    await request(buildApp())
      .post('/api/seller/products')
      .set(sellerAuth)
      .send({ ...validProduct, status: 'approved', sellerId: 'autre' });

    const data = (prismaMock.product.create.mock.calls[0][0] as any).data;
    expect(data.status).toBe('pending');
    expect(data.sellerId).toBe('c1');
  });
});

describe('modification, stock, retrait, suppression', () => {
  const own = { id: 'p1', sellerId: 'c1', status: 'approved' };
  const foreign = { id: 'p2', sellerId: 'autre', status: 'approved' };

  it('remet un produit modifié en attente de validation', async () => {
    prismaMock.product.findUnique.mockResolvedValue(own as any);
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat1', slug: 'mobiles' } as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.product.update.mockResolvedValue({ id: 'p1', category: 'mobiles', priceTiers: [] } as any);

    const res = await request(buildApp()).put('/api/seller/products/p1').set(sellerAuth).send(validProduct);

    expect(res.status).toBe(200);
    expect((prismaMock.product.update.mock.calls[0][0] as any).data).toMatchObject({
      status: 'pending',
      rejectionReason: null,
    });
    expect(invalidateProductCache).toHaveBeenCalled();
  });

  it('interdit de modifier le produit d’un autre vendeur (404, sans le révéler)', async () => {
    prismaMock.product.findUnique.mockResolvedValue(foreign as any);

    const res = await request(buildApp()).put('/api/seller/products/p2').set(sellerAuth).send(validProduct);

    expect(res.status).toBe(404);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('met à jour le stock sans nouvelle validation', async () => {
    prismaMock.product.findUnique.mockResolvedValue(own as any);
    prismaMock.product.update.mockResolvedValue({ id: 'p1', category: 'mobiles' } as any);

    const res = await request(buildApp())
      .patch('/api/seller/products/p1/stock')
      .set(sellerAuth)
      .send({ stockQuantity: 0 });

    expect(res.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: 0, inStock: false },
    });
  });

  it('refuse un stock invalide', async () => {
    const res = await request(buildApp())
      .patch('/api/seller/products/p1/stock')
      .set(sellerAuth)
      .send({ stockQuantity: -3 });

    expect(res.status).toBe(400);
  });

  it('désactive au lieu de supprimer un produit déjà commandé', async () => {
    prismaMock.product.findUnique.mockResolvedValue(own as any);
    prismaMock.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as any);
    prismaMock.product.update.mockResolvedValue({} as any);

    const res = await request(buildApp()).delete('/api/seller/products/p1').set(sellerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
    expect(prismaMock.product.update).toHaveBeenCalled();
  });

  it('supprime un produit jamais commandé', async () => {
    prismaMock.product.findUnique.mockResolvedValue(own as any);
    prismaMock.orderItem.findFirst.mockResolvedValue(null);
    prismaMock.product.delete.mockResolvedValue({} as any);

    const res = await request(buildApp()).delete('/api/seller/products/p1').set(sellerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(deleteUploadedImages).toHaveBeenCalled();
  });
});
