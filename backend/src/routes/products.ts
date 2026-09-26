import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { sendValidationError, singleMessage } from '../lib/validation.js';
import { IMAGE_URL_PATTERN, deleteReplacedImages, deleteUploadedImages, thumbnailUrl } from '../lib/uploads.js';
import { withCache, CACHE_TTL, CACHE_KEYS, invalidateProductCache } from '../lib/cache.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';

const router = Router();

// ---------- Validation des entrées (zod) ----------
// Les messages reprennent ceux affichés par l'administration ; l'ordre des champs fixe l'ordre des vérifications
// (la première erreur est renvoyée au client).

// Pagination du catalogue, facultative : sans `limit`, toute la liste (comportement du site web).
// Avec `limit` (application mobile) : une page de résultats et l'information `hasMore`.
const PAGE = 'Pagination invalide (page ≥ 1, limit entre 1 et 100)';
const paginationSchema = z.object({
  page: z.coerce.number({ message: PAGE }).int(PAGE).min(1, PAGE).default(1),
  limit: z.coerce.number({ message: PAGE }).int(PAGE).min(1, PAGE).max(100, PAGE).optional(),
});

const RATING = 'La note doit être un entier entre 1 et 5';
const COMMENT = 'Le commentaire est limité à 1000 caractères';
const reviewSchema = z.object({
  rating: z.number({ message: RATING }).int(RATING).min(1, RATING).max(5, RATING),
  comment: z.string({ message: COMMENT }).max(1000, COMMENT).nullish(),
});

// Toute erreur de ces deux schémas renvoie un message unique (voir les appels à parse)
const stockSchema = z.object({ stockQuantity: z.number().min(0) });
const priceTiersSchema = z.object({
  tiers: z.array(z.object({ minQty: z.number().positive(), unitPrice: z.number().positive() })),
});

// Le produit ne stocke que des URL d'images : fichiers envoyés via POST /api/uploads, visuels du site
// ou adresses https. Les images elles-mêmes ne transitent jamais dans le JSON des produits.
const IMAGES = 'Images invalides : envoyez les photos avec le bouton « Ajouter » ou collez une adresse https';
const imagesSchema = z
  .array(z.string({ message: IMAGES }).max(2048, IMAGES).regex(IMAGE_URL_PATTERN, IMAGES), { message: IMAGES })
  .max(10, '10 images maximum');

// Chaque contrôle porte son message : `{ message }` sur le type ne couvre que les erreurs de type,
// pas celles de .int() / .min() / .max().
const INVALID = 'Données invalides';
const MOQ = 'Quantité minimum de commande invalide';
const UNIT = 'Unité de vente invalide';
const WEIGHT = 'Poids estimé invalide (entre 0 et 500 kg)';
const DATE = 'Date de disponibilité invalide';
const productSchema = z.object({
  name: z.string({ message: INVALID }).min(1, INVALID),
  category: z.string({ message: INVALID }).min(1, INVALID),
  price: z.number({ message: INVALID }).positive(INVALID),
  // Champs « vente en gros + logistique » (facultatifs)
  moq: z.number({ message: MOQ }).int(MOQ).min(1, MOQ).optional(),
  unit: z.string({ message: UNIT }).trim().min(1, UNIT).optional(),
  estimatedWeightKg: z.number({ message: WEIGHT }).positive(WEIGHT).max(500, WEIGHT).nullish(),
  freeShipping: z.boolean({ message: 'Valeur de livraison gratuite invalide' }).optional(),
  availableFrom: z
    .union([z.string(), z.number()], { errorMap: () => ({ message: DATE }) })
    .nullish()
    .refine((value) => value === undefined || value === null || value === '' || !Number.isNaN(new Date(value).getTime()), {
      message: DATE,
    }),
  images: imagesSchema.optional(),
  description: z.string({ message: INVALID }).nullish(),
  stockQuantity: z.number({ message: 'Quantité de stock invalide' }).min(0, 'Quantité de stock invalide').nullish(),
});

type RatingStats = Map<string, { average: number; count: number }>;

// Note moyenne et nombre d'avis par produit, en une seule requête d'agrégation.
async function getRatingStats(productIds: string[]): Promise<RatingStats> {
  const stats: RatingStats = new Map();
  if (productIds.length === 0) return stats;

  const rows = await prisma.review.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  for (const row of rows ?? []) {
    stats.set(row.productId, {
      average: Math.round((row._avg.rating ?? 0) * 10) / 10,
      count: row._count.rating,
    });
  }
  return stats;
}

// Produits visibles publiquement : validés par l'admin, dont le vendeur (s'il y en a un) est approuvé
const PUBLIC_PRODUCT_FILTER = {
  status: 'approved' as const,
  OR: [{ sellerId: null }, { seller: { status: 'approved' as const } }],
};

const SELLER_SELECT = { select: { id: true, name: true } };

// Transform product for frontend
function transformProduct(p: any, ratings?: RatingStats) {
  const stats = ratings?.get(p.id);
  return {
    ...p,
    seller: p.seller ?? null,
    rating: stats ? stats.average : null,
    reviewCount: stats ? stats.count : 0,
    category: p.category.replace('_', '-'),
    isActive: p.isActive ?? true,
    moq: p.moq ?? 1,
    unit: p.unit ?? 'piece',
    estimatedWeightKg: p.estimatedWeightKg ?? null,
    freeShipping: p.freeShipping ?? false,
    availableFrom: p.availableFrom ?? null,
    priceTiers: p.priceTiers ?? [],
    // Miniatures (400 px) pour les listes de l'application mobile ; même ordre que images
    thumbnails: (p.images ?? []).map(thumbnailUrl),
    metadata: {
      dimensions: p.dimensions,
      weight: p.weight,
    },
  };
}

// Get all products with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, inStock, includeInactive, seller } = req.query;
    const { page, limit } = paginationSchema.parse({ page: req.query.page, limit: req.query.limit });

    // Build cache key based on query params
    const cacheKey = `${CACHE_KEYS.PRODUCTS}:list:${category || 'all'}:${search || ''}:${inStock || ''}:${includeInactive || ''}:${seller || ''}:${limit ? `${page}x${limit}` : 'all'}`;

    const result = await withCache(
      cacheKey,
      CACHE_TTL.PRODUCTS,
      async () => {
        const where: any = { AND: [PUBLIC_PRODUCT_FILTER] };

        // Produits d'un vendeur (page « profil vendeur »)
        if (seller && typeof seller === 'string') {
          where.sellerId = seller;
        }

        // Filter by category (slugs are dash-separated, stored values use underscores)
        if (category && category !== 'all') {
          where.category = (category as string).replace(/-/g, '_');
        }

        // Filter by search term
        if (search && typeof search === 'string') {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Filter by stock status (afficher tous les produits par défaut, y compris épuisés)
        if (inStock === 'true') {
          where.inStock = true;
        } else if (inStock === 'false') {
          where.inStock = false;
        }

        // Filter by active status (masquer les produits inactifs par défaut)
        if (includeInactive !== 'true') {
          where.isActive = true;
        }

        const query = {
          where,
          include: { priceTiers: { orderBy: { minQty: 'asc' as const } }, seller: SELLER_SELECT },
          orderBy: [
            { inStock: 'desc' as const },  // En stock en premier
            { createdAt: 'desc' as const },
            { id: 'asc' as const },         // ordre stable d'une page à l'autre
          ],
        };

        // Liste complète (site web) ou une page (application mobile)
        const [products, total] = limit
          ? await prisma.$transaction([
              prisma.product.findMany({ ...query, skip: (page - 1) * limit, take: limit }),
              prisma.product.count({ where }),
            ])
          : await prisma.product.findMany(query).then((all) => [all, all.length] as const);

        const ratings = await getRatingStats(products.map((p) => p.id));
        const transformedProducts = products.map((p) => transformProduct(p, ratings));

        return {
          products: transformedProducts,
          total,
          ...(limit ? { page, limit, hasMore: page * limit < total } : {}),
        };
      }
    );

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      details: error?.message || 'Unknown error'
    });
  }
});

// Get product by slug
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const cacheKey = `${CACHE_KEYS.PRODUCT}:${slug}`;

    const product = await withCache(
      cacheKey,
      CACHE_TTL.PRODUCT,
      async () => {
        const p = await prisma.product.findFirst({
          where: { slug, ...PUBLIC_PRODUCT_FILTER },
          include: { priceTiers: { orderBy: { minQty: 'asc' } }, seller: SELLER_SELECT },
        });

        if (!p) return null;
        return transformProduct(p, await getRatingStats([p.id]));
      }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Get related products
router.get('/:slug/related', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const limit = parseInt(req.query.limit as string) || 4;
    const cacheKey = `${CACHE_KEYS.RELATED}:${slug}:${limit}`;

    const result = await withCache(
      cacheKey,
      CACHE_TTL.RELATED,
      async () => {
        const product = await prisma.product.findUnique({
          where: { slug },
        });

        if (!product) return null;

        const relatedProducts = await prisma.product.findMany({
          where: {
            category: product.category,
            slug: { not: slug },
            ...PUBLIC_PRODUCT_FILTER,
          },
          include: { priceTiers: { orderBy: { minQty: 'asc' } }, seller: SELLER_SELECT },
          take: limit,
        });

        const ratings = await getRatingStats(relatedProducts.map((p) => p.id));
        return relatedProducts.map((p) => transformProduct(p, ratings));
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching related products:', error);
    res.status(500).json({ error: 'Failed to fetch related products' });
  }
});

// Avis d'un produit (liste + moyenne). L'auteur est réduit à « Prénom N. ».
router.get('/:slug/reviews', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where: { productId: product.id },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      getRatingStats([product.id]),
    ]);

    const summary = stats.get(product.id);
    res.json({
      average: summary ? summary.average : null,
      count: summary ? summary.count : 0,
      reviews: (reviews ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: `${r.user.firstName} ${r.user.lastName.charAt(0)}.`.trim(),
      })),
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Laisser (ou modifier) son avis : un seul avis par utilisateur et par produit.
router.post('/:slug/reviews', authenticate, async (req: Request, res: Response) => {
  try {
    const { rating, comment } = reviewSchema.parse(req.body ?? {});
    if (req.user?.role === 'platform_admin') {
      return res.status(403).json({ error: "Les administrateurs ne peuvent pas noter les produits" });
    }

    const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const text = typeof comment === 'string' && comment.trim() ? comment.trim() : null;
    const review = await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: req.user!.userId } },
      create: { productId: product.id, userId: req.user!.userId, rating, comment: text },
      update: { rating, comment: text },
    });

    await invalidateProductCache();
    res.status(201).json({ success: true, review: { id: review.id, rating: review.rating, comment: review.comment } });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error saving review:', error);
    res.status(500).json({ error: "Impossible d'enregistrer l'avis" });
  }
});

// Admin: Update product stock
router.patch('/:productId/stock', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { stockQuantity } = stockSchema.parse(req.body, singleMessage('Quantité de stock invalide'));

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity,
        inStock: stockQuantity > 0,
      },
    });

    await invalidateProductCache();
    res.json({ success: true, product });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating product stock:', error);
    res.status(500).json({ error: 'Failed to update product stock' });
  }
});

// Admin: Replace a product's price tiers (paliers de prix dégressifs)
router.put('/:productId/price-tiers', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { tiers } = priceTiersSchema.parse(req.body, singleMessage('Paliers de prix invalides'));

    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    await prisma.$transaction([
      prisma.priceTier.deleteMany({ where: { productId } }),
      prisma.priceTier.createMany({
        data: tiers.map((t) => ({
          productId,
          minQty: t.minQty,
          unitPrice: t.unitPrice,
        })),
      }),
    ]);

    await invalidateProductCache();

    const priceTiers = await prisma.priceTier.findMany({
      where: { productId },
      orderBy: { minQty: 'asc' },
    });

    res.json({ success: true, priceTiers });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating price tiers:', error);
    res.status(500).json({ error: 'Failed to update price tiers' });
  }
});

// A product's category must match an existing entry in the dynamic categories table
// (categories are managed freely from /admin/categories; slugs use dashes there, but are
// stored on Product with underscores for historical reasons).
async function isValidProductCategory(category: unknown): Promise<boolean> {
  if (typeof category !== 'string' || !category) return false;
  const match = await prisma.category.findFirst({
    where: { slug: category.replace(/_/g, '-') },
  });
  return Boolean(match);
}

// Normalise la date de disponibilité reçue du client (string ISO / '' / null) en Date | null.
function parseAvailableFrom(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return new Date(value as string);
}

// Generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Admin: Create new product
router.post('/', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, category, price, stockQuantity, images,
      moq, unit, estimatedWeightKg, freeShipping, availableFrom } = productSchema.parse(req.body);

    if (!(await isValidProductCategory(category))) {
      return res.status(400).json({
        error: `Catégorie "${category}" introuvable. Créez-la d'abord dans la gestion des catégories.`,
      });
    }

    // Generate unique slug
    let slug = generateSlug(name);
    const existingProduct = await prisma.product.findUnique({ where: { slug } });
    if (existingProduct) {
      slug = `${slug}-${Date.now()}`;
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description: description || '',
        shortDescription: description ? description.substring(0, 100) : '',
        category,
        price,
        stockQuantity: stockQuantity || 0,
        inStock: (stockQuantity || 0) > 0,
        images: images || [],
        moq: moq ?? 1,
        unit: unit ?? 'piece',
        estimatedWeightKg: estimatedWeightKg ?? null,
        freeShipping: freeShipping ?? false,
        availableFrom: parseAvailableFrom(availableFrom),
      },
    });

    await invalidateProductCache();
    res.status(201).json({ success: true, product: transformProduct(product) });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Admin: Update product
router.put('/:productId', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { name, description, category, price, stockQuantity, images,
      moq, unit, estimatedWeightKg, freeShipping, availableFrom } = productSchema.parse(req.body);

    if (!(await isValidProductCategory(category))) {
      return res.status(400).json({
        error: `Catégorie "${category}" introuvable. Créez-la d'abord dans la gestion des catégories.`,
      });
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    // Un produit lié à des commandes reste entièrement modifiable, sauf son nom :
    // les historiques de commandes affichent le nom du produit en direct.
    if (name !== existingProduct.name) {
      const linkedOrderItem = await prisma.orderItem.findFirst({
        where: { productId },
        select: { id: true },
      });
      if (linkedOrderItem) {
        return res.status(400).json({
          error: "Le nom d'un produit lié à des commandes ne peut pas être modifié.",
        });
      }
    }

    // Generate new slug if name changed
    let slug = existingProduct.slug;
    if (name !== existingProduct.name) {
      slug = generateSlug(name);
      const slugExists = await prisma.product.findFirst({
        where: { slug, id: { not: productId } },
      });
      if (slugExists) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        name,
        slug,
        description: description || '',
        shortDescription: description ? description.substring(0, 100) : '',
        category,
        price,
        stockQuantity: stockQuantity ?? existingProduct.stockQuantity,
        inStock: (stockQuantity ?? existingProduct.stockQuantity) > 0,
        images: images || existingProduct.images,
        moq: moq ?? existingProduct.moq,
        unit: unit ?? existingProduct.unit,
        estimatedWeightKg:
          estimatedWeightKg === undefined ? existingProduct.estimatedWeightKg : estimatedWeightKg,
        freeShipping:
          freeShipping === undefined ? existingProduct.freeShipping : freeShipping,
        availableFrom:
          availableFrom === undefined ? existingProduct.availableFrom : parseAvailableFrom(availableFrom),
      },
    });

    await deleteReplacedImages(existingProduct.images, product.images);
    await invalidateProductCache();
    res.json({ success: true, product: transformProduct(product) });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Admin: Update product images only (allowed even if product has orders,
// since changing the photo doesn't affect order history integrity)
router.patch('/:productId/images', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { images } = z.object({ images: imagesSchema }).parse(req.body);

    const existingProduct = await prisma.product.findUnique({ where: { id: productId }, select: { images: true } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: { images },
    });
    await deleteReplacedImages(existingProduct.images, images);

    await invalidateProductCache();
    res.json({ success: true, product: transformProduct(product) });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating product images:', error);
    res.status(500).json({ error: 'Failed to update product images' });
  }
});

// Toggle product visibility (isActive)
router.patch('/:productId/visibility', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { isActive } = z.object({ isActive: z.boolean().optional() }).parse(req.body ?? {});

    const product = await prisma.product.update({
      where: { id: productId },
      data: { isActive: isActive ?? false },
    });

    await invalidateProductCache();
    res.json({
      success: true,
      isActive: product.isActive,
      message: product.isActive ? 'Produit visible dans le catalogue' : 'Produit masqué du catalogue'
    });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Check if product has orders (for delete warning)
router.get('/:productId/has-orders', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    const orderItem = await prisma.orderItem.findFirst({
      where: { productId },
      include: {
        order: {
          select: { orderNumber: true, createdAt: true }
        }
      }
    });

    const ordersCount = await prisma.orderItem.count({
      where: { productId }
    });

    res.json({
      hasOrders: !!orderItem,
      ordersCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Delete product
router.delete('/:productId', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    // Check if product has orders
    const orderItems = await prisma.orderItem.findFirst({
      where: { productId },
    });

    if (orderItems) {
      // Soft delete - just mark as out of stock instead of deleting
      await prisma.product.update({
        where: { id: productId },
        data: { inStock: false, stockQuantity: 0 },
      });
      await invalidateProductCache();
      return res.json({
        success: true,
        message: 'Produit désactivé (conservé car lié à des commandes)'
      });
    }

    await prisma.product.delete({ where: { id: productId } });
    await deleteUploadedImages(existingProduct.images);
    await invalidateProductCache();
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
