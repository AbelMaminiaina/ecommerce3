import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { withCache, CACHE_TTL, CACHE_KEYS } from '../lib/cache.js';
import { rateLimit } from '../lib/rateLimit.js';
import { getAdvice, normalizeText } from '../services/advisorService.js';
import { PUBLIC_PRODUCT_FILTER, SELLER_SELECT, getRatingStats, transformProduct } from './products.js';

const router = Router();

const advisorSchema = z.object({
  question: z.string().trim().min(3).max(500),
});

// Limite par visiteur pour ne pas épuiser le quota gratuit de Mistral / Gemini
const advisorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Trop de demandes, merci de réessayer un peu plus tard.',
});

// Taille maximale du catalogue envoyé à l'IA (les produits en stock et les plus récents d'abord)
const CATALOG_LIMIT = 300;

const PUBLIC_WHERE = { AND: [PUBLIC_PRODUCT_FILTER], isActive: true };

router.post('/', advisorLimiter, async (req: Request, res: Response) => {
  try {
    const { question } = advisorSchema.parse(req.body);

    // Même question (à la casse et aux accents près) → même réponse, sans rappeler l'IA
    const cacheKey = `${CACHE_KEYS.ADVISOR}:${normalizeText(question).replace(/\s+/g, ' ')}`;

    const advice = await withCache(cacheKey, CACHE_TTL.ADVISOR, async () => {
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
    });

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
