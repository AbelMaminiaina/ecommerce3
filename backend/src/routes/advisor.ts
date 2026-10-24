import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { getCache, setCache, CACHE_TTL, CACHE_KEYS } from '../lib/cache.js';
import { optionalAuthenticate } from '../middleware/auth.js';
import { aiConfigured, getAdvice, normalizeText, type Advice } from '../services/advisorService.js';
import { PUBLIC_PRODUCT_FILTER, SELLER_SELECT, getRatingStats, transformProduct } from './products.js';

const router = Router();

const advisorSchema = z.object({
  question: z.string().trim().min(3).max(500),
});

// Limites, pour ne pas épuiser le quota de Mistral / Gemini. Elles ne comptent QUE les questions réellement
// envoyées à l'IA : une réponse déjà en cache, ou la recherche par mots-clés (aucune clé configurée), ne coûtent rien.
//  - par visiteur (compte connecté, sinon identifiant d'appareil X-Visitor-Id + adresse IP) : ADVISOR_MAX_PER_HOUR (20) ;
//  - par adresse IP, large : ADVISOR_MAX_PER_IP_HOUR (200). À Madagascar, beaucoup d'abonnés mobiles sortent par la
//    même adresse IP de leur opérateur : une limite stricte par adresse bloquerait des clients qui n'ont rien fait.
// En mémoire : suffisant pour une seule instance du backend.
const HOUR_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function intSetting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Secondes avant de pouvoir reposer une question si une limite est atteinte ; 0 sinon (la question est comptée) */
export function advisorRetryAfter(keys: { key: string; max: number }[], now = Date.now()): number {
  const recent = keys.map(({ key, max }) => ({ key, max, times: (hits.get(key) ?? []).filter((t) => now - t < HOUR_MS) }));
  const blocked = recent.find((r) => r.times.length >= r.max);
  if (blocked) return Math.ceil((blocked.times[0] + HOUR_MS - now) / 1000);
  for (const r of recent) hits.set(r.key, [...r.times, now]);
  if (hits.size > 20_000) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < HOUR_MS)) hits.delete(key);
  }
  return 0;
}

export function resetAdvisorLimits(): void {
  hits.clear();
}

const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Taille maximale du catalogue envoyé à l'IA (les produits en stock et les plus récents d'abord)
const CATALOG_LIMIT = 300;

const PUBLIC_WHERE = { AND: [PUBLIC_PRODUCT_FILTER], isActive: true };

// Conseil de l'IA (ou de la recherche par mots-clés) sur le catalogue public
async function computeAdvice(question: string): Promise<Advice> {
  // Catalogue léger : seulement le texte utile au conseil, jamais les images
  const catalog = await prisma.product.findMany({
    where: PUBLIC_WHERE,
    select: {
      slug: true,
      name: true,
      category: true,
      shortDescription: true,
      price: true,
      inStock: true,
      availableFrom: true,
      freeShipping: true,
      moq: true,
      unit: true,
      seller: { select: { name: true } },
    },
    orderBy: [{ inStock: 'desc' }, { createdAt: 'desc' }],
    take: CATALOG_LIMIT,
  });
  return getAdvice(question, catalog);
}

router.post('/', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { question } = advisorSchema.parse(req.body);

    // Même question (à la casse et aux accents près) → même réponse, sans rappeler l'IA
    const cacheKey = `${CACHE_KEYS.ADVISOR}:${normalizeText(question).replace(/\s+/g, ' ')}`;

    let advice = await getCache<Advice>(cacheKey);
    if (!advice) {
      if (aiConfigured()) {
        const ip = req.ip ?? 'inconnue';
        const visitor = String(req.headers['x-visitor-id'] ?? '');
        const visitorKey = req.user ? `user:${req.user.userId}` : `visitor:${ip}|${VISITOR_ID.test(visitor) ? visitor : '-'}`;
        const retryAfter = advisorRetryAfter([
          { key: visitorKey, max: intSetting('ADVISOR_MAX_PER_HOUR', 20) },
          { key: `ip:${ip}`, max: intSetting('ADVISOR_MAX_PER_IP_HOUR', 200) },
        ]);
        if (retryAfter > 0) {
          res.setHeader('Retry-After', String(retryAfter));
          const minutes = Math.max(1, Math.ceil(retryAfter / 60));
          return res.status(429).json({
            error: `Vous avez posé beaucoup de questions au conseiller : réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
          });
        }
      }
      advice = await computeAdvice(question);
      await setCache(cacheKey, advice, CACHE_TTL.ADVISOR);
    }

    // Produits rechargés à chaque fois pour que le stock et le prix affichés soient à jour
    const products = advice.slugs.length
      ? await prisma.product.findMany({
          where: { ...PUBLIC_WHERE, slug: { in: advice.slugs } },
          include: { priceTiers: { orderBy: { minQty: 'asc' } }, seller: SELLER_SELECT },
        })
      : [];
    const ordered = advice.slugs
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const ratings = await getRatingStats(ordered.map((p) => p.id));

    res.json({
      message: advice.message,
      source: advice.source,
      products: ordered.map((p) => transformProduct(p, ratings)),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Question invalide (entre 3 et 500 caractères)' });
    }

    console.error('Error processing advisor request:', error);
    res.status(500).json({ error: 'Le conseiller est indisponible pour le moment' });
  }
});

export default router;
