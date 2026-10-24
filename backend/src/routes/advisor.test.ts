import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/redis');

import prisma from '../lib/prisma.js';
import redis from '../lib/redis';
import advisorRouter, { resetAdvisorLimits } from './advisor.js';
import { cleanMessage, getAdvice, resetProviderPauses, selectCatalog } from '../services/advisorService.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const catalog = [
  {
    slug: 'perceuse-visseuse',
    name: 'Perceuse visseuse sans fil',
    category: 'outillage',
    shortDescription: 'Perceuse 18 V avec deux batteries',
    price: 185000,
    inStock: true,
    availableFrom: null,
    freeShipping: false,
    moq: 1,
    unit: 'piece',
    seller: { name: 'Quincaillerie Analakely' },
  },
  {
    slug: 'ciment-50kg',
    name: 'Ciment 50 kg',
    category: 'materiaux',
    shortDescription: 'Sac de ciment Portland',
    price: 42000,
    inStock: true,
    availableFrom: null,
    freeShipping: false,
    moq: 10,
    unit: 'sac',
    seller: null,
  },
];

function fullProduct(slug: string) {
  const item = catalog.find((c) => c.slug === slug)!;
  return { ...item, id: `id-${slug}`, images: [], priceTiers: [], seller: null, dimensions: null, weight: null } as any;
}

// Chaque test a sa propre adresse IP : le limiteur (10 questions par heure) est partagé par le module
let ipCounter = 0;
let ip = '';

function buildApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/advisor', advisorRouter);
  return app;
}

function ask(question: string, app = buildApp()) {
  return request(app).post('/api/advisor').set('X-Forwarded-For', ip).send({ question });
}

const fetchMock = vi.fn();

beforeEach(() => {
  mockReset(prismaMock);
  ip = `10.0.0.${++ipCounter}`;
  (redis.get as any).mockResolvedValue(null);
  (redis.set as any).mockResolvedValue(undefined);
  prismaMock.product.findMany.mockImplementation((async (args: any) => {
    if (args?.select) return catalog;
    return args.where.slug.in.map(fullProduct);
  }) as any);
  prismaMock.review.groupBy.mockResolvedValue([] as any);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.MISTRAL_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ADVISOR_MAX_PER_HOUR;
  resetProviderPauses();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/advisor', () => {
  it('rejects a too-short question', async () => {
    const res = await ask('a');

    expect(res.status).toBe(400);
  });

  it('falls back to keyword search when no AI key is configured', async () => {
    const res = await ask('Je cherche une perceuse');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['perceuse-visseuse']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only sends publicly visible products to the AI', async () => {
    await ask('Je cherche une perceuse');

    const where = (prismaMock.product.findMany.mock.calls[0][0] as any).where;
    expect(where.isActive).toBe(true);
    expect(where.AND[0].status).toBe('approved');
  });

  it('returns the products picked by Mistral, ignoring unknown slugs', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify({ message: 'Il vous faut du ciment.', slugs: ['ciment-50kg', 'invente'] }) } },
        ],
      }),
    });

    const res = await ask('Je construis un mur');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ai');
    expect(res.body.message).toBe('Il vous faut du ciment.');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['ciment-50kg']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/chat/completions');
    // Les images ne sont jamais envoyées à l'IA ; la quantité minimum, oui
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).not.toContain('images');
    expect(body).toContain('minimum 10 sac');
  });

  it('falls back to Gemini when Mistral fails', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota exceeded' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ message: 'Une perceuse !', slugs: ['perceuse-visseuse'] }) }] } },
          ],
        }),
      });

    const res = await ask('Je dois percer du béton');

    expect(res.body.source).toBe('ai');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['perceuse-visseuse']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('generativelanguage.googleapis.com');
  });

  it('falls back to keyword search when the AI provider fails', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'quota exceeded' });

    const res = await ask('du ciment svp');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['ciment-50kg']);
  });

  it('serves a cached answer without calling the AI again', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    (redis.get as any).mockResolvedValue(
      JSON.stringify({ message: 'Déjà répondu.', slugs: ['ciment-50kg'], source: 'ai' })
    );

    const res = await ask('Du CIMENT');

    expect(res.body.message).toBe('Déjà répondu.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('advisor:du ciment');
  });

  it('limite les questions envoyées à l’IA par visiteur (ADVISOR_MAX_PER_HOUR)', async () => {
    resetAdvisorLimits();
    process.env.ADVISOR_MAX_PER_HOUR = '20';
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'indisponible' });
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      const res = await ask(`question ${i}`, app);
      expect(res.status).toBe(200);
    }

    const res = await ask('encore une', app);
    expect(res.status).toBe(429);
  });

  it('ne limite pas la recherche par mots-clés (aucune clé d’IA)', async () => {
    resetAdvisorLimits();
    const app = buildApp();
    for (let i = 0; i < 25; i++) {
      const res = await ask(`question ${i}`, app);
      expect(res.status).toBe(200);
    }
  });
});

describe('économie du quota gratuit', () => {
  const item = (slug: string, category: string, name: string) =>
    ({ slug, name, category, shortDescription: 'x'.repeat(200), price: 1000, inStock: true, availableFrom: null, freeShipping: false, moq: 1, unit: 'piece', seller: null }) as any;
  const big = [
    ...Array.from({ length: 40 }, (_, i) => item(`ciment-${i}`, 'materiaux', `Sac de ciment ${i}`)),
    ...Array.from({ length: 40 }, (_, i) => item(`ampoule-${i}`, 'electricite', `Ampoule LED ${i}`)),
    item('perceuse', 'outillage', 'Perceuse visseuse'),
    item('robinet', 'plomberie', 'Robinet mitigeur'),
  ];

  it('n’envoie à l’IA que les produits utiles, plus quelques-uns de chaque catégorie', () => {
    const chosen = selectCatalog('Je cherche des perceuses', big, 25);
    expect(chosen).toHaveLength(25);
    expect(chosen[0].slug).toBe('perceuse');
    expect(new Set(chosen.map((c) => c.category))).toEqual(new Set(['outillage', 'materiaux', 'electricite', 'plomberie']));
  });

  it('raccourcit les descriptions envoyées', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"message":"ok","slugs":["perceuse"]}' } }] }) });

    await getAdvice('perceuse', big);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.max_tokens).toBe(300);
    expect(sent.messages[0].content).not.toContain('x'.repeat(100));
    expect(sent.messages[0].content.split('slug=').length - 1).toBe(25);
  });

  it('met en pause un fournisseur au quota dépassé, puis le rappelle après la pause', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';
    const gemini = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"message":"ok","slugs":[]}' }] } }] }) };
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('mistral') ? { ok: false, status: 429, text: async () => 'quota', headers: new Headers() } : gemini
    );
    const t0 = Date.now();

    await getAdvice('perceuse', big, t0);
    await getAdvice('robinet', big, t0 + 10_000);
    const mistralCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('mistral')).length;
    expect(mistralCalls()).toBe(1); // en pause : pas rappelé 10 s plus tard

    await getAdvice('ampoule', big, t0 + 61_000);
    expect(mistralCalls()).toBe(2); // pause d'une minute terminée
  });
});

describe('réponse sans produit de l’IA', () => {
  const answer = (content: object) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) });

  it('produits inventés seulement : passe à la recherche dans les données de la boutique', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue(answer({ message: 'Prenez la super-perceuse 3000 !', slugs: ['super-perceuse-3000'] }));

    const res = await ask('Je cherche une perceuse');

    expect(res.body.source).toBe('fallback');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['perceuse-visseuse']);
  });

  it('aucun produit proposé : garde le message de l’IA et ajoute les produits correspondants', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue(answer({ message: 'Pour votre mur, il vous faut du ciment.', slugs: [] }));

    const res = await ask('Je veux du ciment pour un mur');

    expect(res.body.source).toBe('ai');
    expect(res.body.message).toBe('Pour votre mur, il vous faut du ciment.');
    expect(res.body.products.map((p: any) => p.slug)).toEqual(['ciment-50kg']);
  });

  it('question hors sujet sans produit correspondant : le message seul', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    fetchMock.mockResolvedValue(answer({ message: 'Je ne peux conseiller que sur les produits de Tsena Pro.', slugs: [] }));

    const res = await ask('Quel temps fera-t-il demain ?');

    expect(res.body.source).toBe('ai');
    expect(res.body.products).toEqual([]);
  });
});

describe('cleanMessage', () => {
  it('strips Markdown and leaked slugs from the AI message', () => {
    expect(cleanMessage('Une **perceuse** (slug: perceuse-visseuse) et du ciment (slug: ciment-50kg).')).toBe(
      'Une perceuse et du ciment.'
    );
  });
});
