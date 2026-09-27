import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/emailService.js', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendOrderCancellationEmail: vi.fn().mockResolvedValue(true),
  sendOrderShippedEmail: vi.fn().mockResolvedValue(true),
  sendOrderDeliveredEmail: vi.fn().mockResolvedValue(true),
}));

import prisma from '../lib/prisma.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import checkoutRouter from './checkout.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

process.env.PAYMENT_MVOLA_NUMBER = '034 00 000 00';
process.env.PAYMENT_ACCOUNT_NAME = 'Tsena';

// Ce fichier a son propre limiteur de débit en mémoire (un module par fichier de test) : les tests
// fonctionnels restent sous la limite de 10 commandes invitées par heure, le dernier la dépasse.
beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendOrderConfirmationEmail).mockClear();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', checkoutRouter);
  return app;
}

const guest = { name: 'Rakoto Jean', email: 'Jean.Rakoto@Example.mg', phone: '034 00 000 00' };

const payload = {
  items: [{ productId: 'p1', quantity: 10 }],
  shippingAddress: { street: '12 rue des Champs', city: 'Antananarivo', postalCode: '101' },
  deliveryMethod: 'standard' as const,
  paymentMethod: 'mvola' as const,
  guest,
};

const product = {
  id: 'p1',
  name: 'Produit 1',
  price: 20000,
  moq: 10,
  unit: 'piece',
  stockQuantity: 100,
  freeShipping: false,
  availableFrom: null,
  status: 'approved',
  isActive: true,
  sellerId: null,
  seller: null,
  // Le palier ne doit PAS s'appliquer : les tarifs dégressifs sont réservés aux entreprises
  priceTiers: [{ minQty: 10, unitPrice: 15000 }],
};

function mockHappyPath() {
  prismaMock.product.findMany.mockResolvedValue([product] as any);
  prismaMock.address.create.mockResolvedValue({ id: 'addr1', street: 'r', city: 'Tana', postalCode: '101', country: 'Madagascar' } as any);
  prismaMock.order.create.mockResolvedValue({ id: 'order1', orderNumber: 'ORD-GUEST', items: [] } as any);
  prismaMock.product.update.mockResolvedValue({} as any);
}

describe('POST /api/checkout sans compte', () => {
  it('crée la commande d’un visiteur au prix de base, sans facture ni compte', async () => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/checkout').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.orderNumber).toBe('ORD-GUEST');
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    expect(res.body.payment).toMatchObject({ method: 'mvola', totalAmount: 200000 });

    const data = (prismaMock.order.create.mock.calls[0][0] as any).data;
    expect(data).toMatchObject({
      userId: null,
      companyId: null,
      guestName: 'Rakoto Jean',
      guestEmail: 'jean.rakoto@example.mg',
      guestPhone: '034 00 000 00',
      paymentMethod: 'mvola',
      paymentStatus: 'awaiting',
      subtotal: 200000,
    });
    expect(data.items.create[0].price).toBe(20000);
  });

  it('rattache l’adresse à personne (pas de compte)', async () => {
    mockHappyPath();

    await request(buildApp()).post('/api/checkout').send(payload);

    const data = (prismaMock.address.create.mock.calls[0][0] as any).data;
    expect(data.userId).toBeUndefined();
    expect(data.companyId).toBeUndefined();
    expect(data.street).toBe('12 rue des Champs');
  });

  it('envoie la confirmation à l’adresse e-mail saisie', async () => {
    mockHappyPath();

    await request(buildApp()).post('/api/checkout').send(payload);

    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'Jean.Rakoto@Example.mg', companyName: 'Rakoto Jean' })
    );
  });

  it('exige les coordonnées', async () => {
    const res = await request(buildApp())
      .post('/api/checkout')
      .send({ ...payload, guest: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('coordonnées');
  });

  it.each([
    ['e-mail invalide', { ...guest, email: 'pas-un-email' }],
    ['nom trop court', { ...guest, name: 'A' }],
    ['téléphone manquant', { ...guest, phone: '' }],
  ])('refuse des coordonnées invalides (%s)', async (_label, badGuest) => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/checkout').send({ ...payload, guest: badGuest });

    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('applique la quantité minimum de gros aux visiteurs', async () => {
    prismaMock.product.findMany.mockResolvedValue([product] as any);

    const res = await request(buildApp())
      .post('/api/checkout')
      .send({ ...payload, items: [{ productId: 'p1', quantity: 2 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Quantité minimum');
  });

  it('refuse la demande quand le champ piège anti-robot est rempli', async () => {
    mockHappyPath();

    const res = await request(buildApp()).post('/api/checkout').send({ ...payload, website: 'http://spam.example' });

    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('limite le nombre de commandes invitées par adresse IP', async () => {
    mockHappyPath();
    const app = buildApp();

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request(app).post('/api/checkout').send(payload)).status);
    }

    expect(statuses).toContain(429);
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});

describe('GET /api/checkout/track (suivi sans compte)', () => {
  const stored = {
    orderNumber: 'ORD-GUEST',
    status: 'pending',
    paymentMethod: 'mvola',
    paymentStatus: 'submitted',
    paymentRejectionReason: null,
    // Ne doit PAS sortir : la référence de la transaction
    paymentReference: 'MP260920.1234',
    guestEmail: 'jean.rakoto@example.mg',
    subtotal: 200000,
    shippingCost: 0,
    total: 200000,
    deliveryMethod: 'standard',
    cancelReason: null,
    createdAt: new Date('2026-09-20'),
    seller: null,
    address: { street: '12 rue des Champs', city: 'Antananarivo', postalCode: '101', country: 'Madagascar' },
    items: [{ quantity: 10, price: 20000, product: { name: 'Produit 1', slug: 'produit-1' } }],
    // Champs qui ne doivent JAMAIS sortir
    guestName: 'Rakoto Jean',
    guestPhone: '034 00 000 00',
  };

  it('renvoie la commande quand le numéro et l’e-mail correspondent (sans tenir compte de la casse)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(stored as any);

    const res = await request(buildApp()).get('/api/checkout/track?orderNumber=ORD-GUEST&email=Jean.RAKOTO@example.mg');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderNumber: 'ORD-GUEST',
      status: 'pending',
      paymentStatus: 'submitted',
      total: 200000,
    });
    expect(res.body.items).toEqual([{ name: 'Produit 1', quantity: 10, price: 20000 }]);
    expect(JSON.stringify(res.body)).not.toContain('Rakoto');
    expect(JSON.stringify(res.body)).not.toContain('034');
    expect(JSON.stringify(res.body)).not.toContain('MP260920');
  });

  it('répond pareil pour un e-mail erroné et un numéro inconnu (pas d’énumération)', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce(stored as any);
    const wrongEmail = await request(buildApp()).get('/api/checkout/track?orderNumber=ORD-GUEST&email=autre@example.mg');
    prismaMock.order.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(buildApp()).get('/api/checkout/track?orderNumber=NOPE&email=jean.rakoto@example.mg');

    expect(wrongEmail.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(wrongEmail.body).toEqual(unknown.body);
  });

  it('ne divulgue pas une commande de compte (sans e-mail invité)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...stored, guestEmail: null } as any);

    const res = await request(buildApp()).get('/api/checkout/track?orderNumber=ORD-GUEST&email=jean.rakoto@example.mg');

    expect(res.status).toBe(404);
  });

  it('exige le numéro et l’e-mail', async () => {
    const res = await request(buildApp()).get('/api/checkout/track?orderNumber=ORD-GUEST');
    expect(res.status).toBe(400);
  });
});
