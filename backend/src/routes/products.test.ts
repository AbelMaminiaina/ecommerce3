import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({
  withCache: (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  CACHE_TTL: { PRODUCTS: 1, PRODUCT: 1, RELATED: 1 },
  CACHE_KEYS: { PRODUCTS: 'products', PRODUCT: 'product', RELATED: 'related' },
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/uploads.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/uploads.js')>()),
  deleteUploadedImages: vi.fn().mockResolvedValue(undefined),
  deleteReplacedImages: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { deleteReplacedImages, deleteUploadedImages } from '../lib/uploads.js';
import { signToken } from '../lib/auth.js';
import productsRouter from './products.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const adminToken = signToken({ userId: 'admin1', role: 'platform_admin', companyId: null });
const buyerToken = signToken({ userId: 'buyer1', role: 'buyer', companyId: 'c1' });
const adminAuth = { Authorization: `Bearer ${adminToken}` };

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(invalidateProductCache).mockClear();
});

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' })); // aligné sur src/index.ts
  app.use('/api/products', productsRouter);
  return app;
}

function baseProduct(overrides: Partial<any> = {}) {
  return {
    id: 'p1',
    name: 'Carton emballage',
    slug: 'carton-emballage',
    description: 'desc',
    shortDescription: 'short',
    category: 'emballage',
    price: 1200,
    stockQuantity: 5,
    inStock: true,
    isActive: true,
    images: [],
    dimensions: null,
    weight: null,
    moq: 1,
    unit: 'piece',
    estimatedWeightKg: null,
    freeShipping: false,
    availableFrom: null,
    priceTiers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GET /api/products', () => {
  it('transforms category dashes and builds metadata', async () => {
    prismaMock.product.findMany.mockResolvedValue([baseProduct({ category: 'oeufs_frais' })] as any);

    const res = await request(buildApp()).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.products[0].category).toBe('oeufs-frais');
    expect(res.body.products[0].metadata).toEqual({ dimensions: null, weight: null });
  });

  it('returns the whole list without pagination fields when no limit is given (web site)', async () => {
    prismaMock.product.findMany.mockResolvedValue([baseProduct(), baseProduct({ id: 'p2', slug: 'p2' })] as any);

    const res = await request(buildApp()).get('/api/products');

    expect(res.body.total).toBe(2);
    expect(res.body).not.toHaveProperty('hasMore');
    const call = prismaMock.product.findMany.mock.calls[0][0] as any;
    expect(call.skip).toBeUndefined();
    expect(call.take).toBeUndefined();
  });

  it('paginates when a limit is given (mobile app)', async () => {
    prismaMock.$transaction.mockImplementation((ops: any) => Promise.all(ops));
    prismaMock.product.findMany.mockResolvedValue([baseProduct({ id: 'p3', slug: 'p3' })] as any);
    prismaMock.product.count.mockResolvedValue(25);

    const res = await request(buildApp()).get('/api/products?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 25, page: 3, limit: 10, hasMore: false });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));

    const first = await request(buildApp()).get('/api/products?page=1&limit=10');
    expect(first.body.hasMore).toBe(true);
  });

  it.each(['limit=0', 'limit=101', 'page=0&limit=10', 'limit=abc'])('rejects invalid pagination (%s)', async (query) => {
    const res = await request(buildApp()).get(`/api/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Pagination invalide (page ≥ 1, limit entre 1 et 100)');
  });

  it('exposes a thumbnail for each uploaded image, and keeps other images as they are', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      baseProduct({ images: ['/uploads/0f0e3a52-1111-4222-8333-944455556666.webp', '/electro/img/product-3.png'] }),
    ] as any);

    const res = await request(buildApp()).get('/api/products');

    expect(res.body.products[0].thumbnails).toEqual([
      '/uploads/0f0e3a52-1111-4222-8333-944455556666-thumb.webp',
      '/electro/img/product-3.png',
    ]);
  });

  it('filters by category, converting dashes to underscores', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);

    await request(buildApp()).get('/api/products?category=oeufs-frais');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'oeufs_frais' }),
      })
    );
  });

  it('hides inactive products by default', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);

    await request(buildApp()).get('/api/products');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
  });

  it('includes inactive products when requested', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);

    await request(buildApp()).get('/api/products?includeInactive=true');

    const call = prismaMock.product.findMany.mock.calls[0][0] as any;
    expect(call.where.isActive).toBeUndefined();
  });

  it('returns 500 with details on failure', async () => {
    prismaMock.product.findMany.mockRejectedValue(new Error('db down'));

    const res = await request(buildApp()).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body.details).toBe('db down');
  });
});

describe('GET /api/products/:slug', () => {
  it('returns 404 when the product does not exist', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/products/unknown');

    expect(res.status).toBe(404);
  });

  it('returns the transformed product', async () => {
    prismaMock.product.findFirst.mockResolvedValue(baseProduct() as any);

    const res = await request(buildApp()).get('/api/products/carton-emballage');

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('carton-emballage');
  });

  it('only serves published products (approved, from an approved seller)', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);

    await request(buildApp()).get('/api/products/en-attente');

    expect(prismaMock.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: 'en-attente',
          status: 'approved',
          OR: [{ sellerId: null }, { seller: { status: 'approved' } }],
        }),
      })
    );
  });
});

describe('PATCH /api/products/:productId/stock', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp())
      .patch('/api/products/p1/stock')
      .send({ stockQuantity: 1 });

    expect(res.status).toBe(401);
  });

  it('rejects a non-admin user', async () => {
    const res = await request(buildApp())
      .patch('/api/products/p1/stock')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ stockQuantity: 1 });

    expect(res.status).toBe(403);
  });

  it('rejects a negative stock quantity', async () => {
    const res = await request(buildApp())
      .patch('/api/products/p1/stock')
      .set(adminAuth)
      .send({ stockQuantity: -1 });

    expect(res.status).toBe(400);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('sets inStock to false when quantity reaches zero', async () => {
    prismaMock.product.update.mockResolvedValue(baseProduct({ stockQuantity: 0, inStock: false }) as any);

    const res = await request(buildApp())
      .patch('/api/products/p1/stock')
      .set(adminAuth)
      .send({ stockQuantity: 0 });

    expect(res.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: 0, inStock: false },
    });
    expect(invalidateProductCache).toHaveBeenCalled();
  });
});

describe('PUT /api/products/:productId/price-tiers', () => {
  it('rejects a non-admin user', async () => {
    const res = await request(buildApp())
      .put('/api/products/p1/price-tiers')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tiers: [] });

    expect(res.status).toBe(403);
  });

  it('rejects invalid tiers', async () => {
    const res = await request(buildApp())
      .put('/api/products/p1/price-tiers')
      .set(adminAuth)
      .send({ tiers: [{ minQty: 0, unitPrice: 100 }] });

    expect(res.status).toBe(400);
  });

  it('replaces the tiers for a product', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct() as any);
    prismaMock.$transaction.mockResolvedValue([] as any);
    prismaMock.priceTier.findMany.mockResolvedValue([{ id: 't1', productId: 'p1', minQty: 10, unitPrice: 1000 }] as any);

    const res = await request(buildApp())
      .put('/api/products/p1/price-tiers')
      .set(adminAuth)
      .send({ tiers: [{ minQty: 10, unitPrice: 1000 }] });

    expect(res.status).toBe(200);
    expect(res.body.priceTiers).toHaveLength(1);
    expect(invalidateProductCache).toHaveBeenCalled();
  });
});

describe('POST /api/products', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp())
      .post('/api/products')
      .send({ name: 'Test', category: 'emballage', price: 100 });

    expect(res.status).toBe(401);
  });

  it('rejects invalid payloads', async () => {
    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: '', category: 'emballage', price: 100 });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown category', async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'Test', category: 'inconnue', price: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('introuvable');
  });

  it('creates a product with a slugified, deduplicated slug', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);
    prismaMock.product.findUnique.mockResolvedValue(baseProduct({ slug: 'carton-renforce' }) as any);
    prismaMock.product.create.mockResolvedValue(baseProduct({ name: 'Carton Renforcé' }) as any);

    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'Carton Renforcé', category: 'emballage', price: 100, stockQuantity: 2 });

    expect(res.status).toBe(201);
    const createCall = prismaMock.product.create.mock.calls[0][0] as any;
    expect(createCall.data.slug).toMatch(/^carton-renforce-\d+$/);
    expect(invalidateProductCache).toHaveBeenCalled();
  });

  it('persists moq, unit, estimatedWeightKg and freeShipping', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue(baseProduct() as any);

    await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({
        name: 'Palette', category: 'emballage', price: 30000, stockQuantity: 5,
        moq: 10, unit: 'carton', estimatedWeightKg: 1.8, freeShipping: true,
      });

    const createCall = prismaMock.product.create.mock.calls[0][0] as any;
    expect(createCall.data.moq).toBe(10);
    expect(createCall.data.unit).toBe('carton');
    expect(createCall.data.estimatedWeightKg).toBe(1.8);
    expect(createCall.data.freeShipping).toBe(true);
  });

  it('rejects an invalid moq', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);

    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'X', category: 'emballage', price: 100, moq: 0 });

    expect(res.status).toBe(400);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range estimatedWeightKg (> 500 kg)', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);

    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'X', category: 'emballage', price: 100, estimatedWeightKg: 501 });

    expect(res.status).toBe(400);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('persists a valid availableFrom date and rejects an invalid one', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue(baseProduct() as any);

    const ok = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'Précommande', category: 'emballage', price: 10000, availableFrom: '2026-12-01' });
    expect(ok.status).toBe(201);
    const createCall = prismaMock.product.create.mock.calls[0][0] as any;
    expect(createCall.data.availableFrom).toBeInstanceOf(Date);
    expect((createCall.data.availableFrom as Date).toISOString()).toBe('2026-12-01T00:00:00.000Z');

    const bad = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'X', category: 'emballage', price: 10000, availableFrom: 'pas-une-date' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Date de disponibilité invalide');
  });

  // Chaque contrôle (type, entier, bornes) renvoie le message français de son champ
  it.each([
    [{ price: 0 }, 'Données invalides'],
    [{ moq: 0 }, 'Quantité minimum de commande invalide'],
    [{ moq: 2.5 }, 'Quantité minimum de commande invalide'],
    [{ unit: '  ' }, 'Unité de vente invalide'],
    [{ estimatedWeightKg: 900 }, 'Poids estimé invalide (entre 0 et 500 kg)'],
    [{ estimatedWeightKg: -1 }, 'Poids estimé invalide (entre 0 et 500 kg)'],
    [{ freeShipping: 'oui' }, 'Valeur de livraison gratuite invalide'],
    [{ availableFrom: true }, 'Date de disponibilité invalide'],
    [{ images: [42] }, 'Images invalides : envoyez les photos avec le bouton « Ajouter » ou collez une adresse https'],
    [
      { images: ['data:image/png;base64,iVBORw0KGgo='] },
      'Images invalides : envoyez les photos avec le bouton « Ajouter » ou collez une adresse https',
    ],
    [{ stockQuantity: -1 }, 'Quantité de stock invalide'],
  ])('rejects %o with a French message', async (patch, message) => {
    const res = await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'Produit', category: 'emballage', price: 1000, ...patch });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('defaults moq to 1 and unit to piece when omitted', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue(baseProduct() as any);

    await request(buildApp())
      .post('/api/products')
      .set(adminAuth)
      .send({ name: 'Article', category: 'emballage', price: 5000 });

    const createCall = prismaMock.product.create.mock.calls[0][0] as any;
    expect(createCall.data.moq).toBe(1);
    expect(createCall.data.unit).toBe('piece');
    expect(createCall.data.freeShipping).toBe(false);
  });
});

describe('PUT /api/products/:productId', () => {
  beforeEach(() => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'c1' } as any);
  });

  it('refuses to rename a product that is linked to orders', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct({ name: 'Ancien nom' }) as any);
    prismaMock.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as any);

    const res = await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({ name: 'Nouveau nom', category: 'emballage', price: 20000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nom.*commandes/i);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('updates moq, unit, estimatedWeightKg and freeShipping', async () => {
    prismaMock.product.findUnique.mockResolvedValue(
      baseProduct({ moq: 1, unit: 'piece', estimatedWeightKg: null, freeShipping: false }) as any
    );
    prismaMock.product.update.mockResolvedValue(baseProduct() as any);

    const res = await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({
        name: 'Carton emballage', category: 'emballage', price: 30000,
        moq: 20, unit: 'carton', estimatedWeightKg: 2.1, freeShipping: true,
      });

    expect(res.status).toBe(200);
    const updateCall = prismaMock.product.update.mock.calls[0][0] as any;
    expect(updateCall.data.moq).toBe(20);
    expect(updateCall.data.unit).toBe('carton');
    expect(updateCall.data.estimatedWeightKg).toBe(2.1);
    expect(updateCall.data.freeShipping).toBe(true);
  });

  it('preserves existing extras when they are omitted from the payload', async () => {
    const existingDate = new Date('2026-11-15T00:00:00.000Z');
    prismaMock.product.findUnique.mockResolvedValue(
      baseProduct({ moq: 5, unit: 'carton', estimatedWeightKg: 1.5, freeShipping: true, availableFrom: existingDate }) as any
    );
    prismaMock.product.update.mockResolvedValue(baseProduct() as any);

    await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({ name: 'Carton emballage', category: 'emballage', price: 31000 });

    const updateCall = prismaMock.product.update.mock.calls[0][0] as any;
    expect(updateCall.data.moq).toBe(5);
    expect(updateCall.data.unit).toBe('carton');
    expect(updateCall.data.estimatedWeightKg).toBe(1.5);
    expect(updateCall.data.freeShipping).toBe(true);
    expect(updateCall.data.availableFrom).toBe(existingDate);
  });

  it('clears availableFrom when null is sent explicitly', async () => {
    prismaMock.product.findUnique.mockResolvedValue(
      baseProduct({ availableFrom: new Date('2026-11-15T00:00:00.000Z') }) as any
    );
    prismaMock.product.update.mockResolvedValue(baseProduct() as any);

    await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({ name: 'Carton emballage', category: 'emballage', price: 31000, availableFrom: null });

    const updateCall = prismaMock.product.update.mock.calls[0][0] as any;
    expect(updateCall.data.availableFrom).toBeNull();
  });

  it('deletes the image files removed from the product', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct({ images: ['/uploads/a.webp', '/uploads/b.webp'] }) as any);
    prismaMock.product.update.mockResolvedValue(baseProduct({ images: ['/uploads/a.webp'] }) as any);

    await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({ name: 'Carton emballage', category: 'emballage', price: 31000, images: ['/uploads/a.webp'] });

    expect(deleteReplacedImages).toHaveBeenCalledWith(['/uploads/a.webp', '/uploads/b.webp'], ['/uploads/a.webp']);
  });

  it('rejects an invalid moq on update', async () => {
    const res = await request(buildApp())
      .put('/api/products/p1')
      .set(adminAuth)
      .send({ name: 'X', category: 'emballage', price: 100, moq: -1 });

    expect(res.status).toBe(400);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/products/:productId', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp()).delete('/api/products/p1');
    expect(res.status).toBe(401);
  });

  it('soft-deletes a product that has existing orders', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct() as any);
    prismaMock.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as any);

    const res = await request(buildApp()).delete('/api/products/p1').set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('désactivé');
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
    // Produit conservé (commandes) : ses photos aussi
    expect(deleteUploadedImages).not.toHaveBeenCalled();
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { inStock: false, stockQuantity: 0 },
    });
  });

  it('hard-deletes a product with no orders', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct({ images: ['/uploads/a.webp'] }) as any);
    prismaMock.orderItem.findFirst.mockResolvedValue(null);

    const res = await request(buildApp()).delete('/api/products/p1').set(adminAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(deleteUploadedImages).toHaveBeenCalledWith(['/uploads/a.webp']);
  });

  it('returns 404 for an unknown product', async () => {
    prismaMock.product.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).delete('/api/products/missing').set(adminAuth);

    expect(res.status).toBe(404);
  });
});

describe('reviews', () => {
  const buyerAuth = { Authorization: `Bearer ${buyerToken}` };

  it('exposes the average rating and review count on the product list', async () => {
    prismaMock.product.findMany.mockResolvedValue([baseProduct(), baseProduct({ id: 'p2', slug: 'autre' })] as any);
    (prismaMock.review.groupBy as any).mockResolvedValue([
      { productId: 'p1', _avg: { rating: 4.333 }, _count: { rating: 3 } },
    ]);

    const res = await request(buildApp()).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.products[0]).toMatchObject({ rating: 4.3, reviewCount: 3 });
    expect(res.body.products[1]).toMatchObject({ rating: null, reviewCount: 0 });
  });

  it('lists reviews with an anonymised author name', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct() as any);
    prismaMock.review.findMany.mockResolvedValue([
      {
        id: 'r1',
        rating: 5,
        comment: 'Très bien',
        createdAt: new Date('2026-01-01'),
        user: { firstName: 'Jean', lastName: 'Rakoto' },
      },
    ] as any);
    (prismaMock.review.groupBy as any).mockResolvedValue([
      { productId: 'p1', _avg: { rating: 5 }, _count: { rating: 1 } },
    ]);

    const res = await request(buildApp()).get('/api/products/carton-emballage/reviews');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ average: 5, count: 1 });
    expect(res.body.reviews[0].author).toBe('Jean R.');
  });

  it('returns 404 when listing reviews of an unknown product', async () => {
    prismaMock.product.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/products/missing/reviews');

    expect(res.status).toBe(404);
  });

  it('requires authentication to post a review', async () => {
    const res = await request(buildApp()).post('/api/products/carton-emballage/reviews').send({ rating: 5 });

    expect(res.status).toBe(401);
  });

  it.each([0, 6, 3.5, '4'])('rejects an invalid rating (%s)', async (rating) => {
    const res = await request(buildApp())
      .post('/api/products/carton-emballage/reviews')
      .set(buyerAuth)
      .send({ rating });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La note doit être un entier entre 1 et 5');
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('forbids platform admins from rating products', async () => {
    const res = await request(buildApp())
      .post('/api/products/carton-emballage/reviews')
      .set(adminAuth)
      .send({ rating: 5 });

    expect(res.status).toBe(403);
  });

  it('saves one review per user and invalidates the product cache', async () => {
    prismaMock.product.findUnique.mockResolvedValue(baseProduct() as any);
    prismaMock.review.upsert.mockResolvedValue({ id: 'r1', rating: 4, comment: 'Bien' } as any);

    const res = await request(buildApp())
      .post('/api/products/carton-emballage/reviews')
      .set(buyerAuth)
      .send({ rating: 4, comment: '  Bien  ' });

    expect(res.status).toBe(201);
    expect(prismaMock.review.upsert).toHaveBeenCalledWith({
      where: { productId_userId: { productId: 'p1', userId: 'buyer1' } },
      create: { productId: 'p1', userId: 'buyer1', rating: 4, comment: 'Bien' },
      update: { rating: 4, comment: 'Bien' },
    });
    expect(invalidateProductCache).toHaveBeenCalled();
  });
});

describe('GET /api/products (publication)', () => {
  it('lists only published products and exposes the seller', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      baseProduct({ seller: { id: 'c9', name: 'Vendeur SARL' } }),
    ] as any);
    (prismaMock.review.groupBy as any).mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/products');

    expect(res.body.products[0].seller).toEqual({ id: 'c9', name: 'Vendeur SARL' });
    const where = (prismaMock.product.findMany.mock.calls[0][0] as any).where;
    expect(where.AND).toEqual([
      { status: 'approved', OR: [{ sellerId: null }, { seller: { status: 'approved' } }] },
    ]);
  });
});

describe('GET /api/products?seller=', () => {
  it('filtre les produits publiés d’un vendeur', async () => {
    prismaMock.product.findMany.mockResolvedValue([] as any);
    (prismaMock.review.groupBy as any).mockResolvedValue([]);

    await request(buildApp()).get('/api/products?seller=c9');

    const where = (prismaMock.product.findMany.mock.calls[0][0] as any).where;
    expect(where.sellerId).toBe('c9');
    expect(where.AND).toBeDefined(); // les produits non validés restent exclus
  });
});
