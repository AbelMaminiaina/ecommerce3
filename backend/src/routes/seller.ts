import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { invalidateProductCache } from '../lib/cache.js';
import { MIN_WHOLESALE_QTY } from '../lib/wholesale.js';
import { IMAGE_URL_PATTERN, deleteReplacedImages, deleteUploadedImages } from '../lib/uploads.js';
import { authenticate, requireApprovedCompany } from '../middleware/auth.js';

// Espace vendeur : une entreprise approuvée publie et gère ses propres produits.
// Toute création ou modification de contenu repasse par la validation de l'administrateur.
const router = Router();
router.use(authenticate, requireApprovedCompany);

const tierSchema = z.object({
  minQty: z.number().int().positive(),
  unitPrice: z.number().int().positive(),
});

const productSchema = z
  .object({
    name: z.string().trim().min(3, 'Le nom doit contenir au moins 3 caractères').max(120),
    description: z.string().trim().min(10, 'La description doit contenir au moins 10 caractères').max(4000),
    shortDescription: z.string().trim().min(3, 'Résumé trop court').max(200),
    category: z.string().trim().min(1, 'Catégorie requise'),
    price: z.number().int().positive('Le prix doit être positif'),
    originalPrice: z.number().int().positive().nullable().optional(),
    // URL uniquement : fichier envoyé via POST /api/uploads, chemin du site ou https (ni data URI ni SVG)
    images: z
      .array(z.string().max(2048).regex(IMAGE_URL_PATTERN, "Format d'image non supporté"))
      .max(5, '5 images maximum'),
    characteristics: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    moq: z
      .number()
      .int()
      .min(MIN_WHOLESALE_QTY, `Vente en gros uniquement : la quantité minimum doit être d'au moins ${MIN_WHOLESALE_QTY}`),
    unit: z.string().trim().min(1).max(30),
    stockQuantity: z.number().int().min(0),
    estimatedWeightKg: z.number().positive().nullable().optional(),
    freeShipping: z.boolean().default(false),
    priceTiers: z.array(tierSchema).max(5).default([]),
  })
  .superRefine((data, ctx) => {
    for (const tier of data.priceTiers) {
      if (tier.minQty <= data.moq) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priceTiers'],
          message: 'Chaque palier doit commencer au-dessus de la quantité minimum',
        });
      }
      if (tier.unitPrice >= data.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priceTiers'],
          message: "Le prix d'un palier doit être inférieur au prix de base",
        });
      }
    }
  });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'produit';
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await prisma.product.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
}

function formatProduct(p: any) {
  return { ...p, category: p.category.replace(/_/g, '-') };
}

// Produits de l'entreprise, tous statuts confondus
router.get('/products', async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { sellerId: req.user!.companyId! },
      include: { priceTiers: { orderBy: { minQty: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products: products.map(formatProduct), minWholesaleQty: MIN_WHOLESALE_QTY });
  } catch (error) {
    console.error('Error fetching seller products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/products', async (req: Request, res: Response) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Données invalides', details: parsed.error.issues });
    }
    const { priceTiers, category, ...data } = parsed.data;

    const categoryRow = await prisma.category.findFirst({ where: { slug: category, isActive: true } });
    if (!categoryRow) {
      return res.status(400).json({ error: 'Catégorie inconnue' });
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        slug: await uniqueSlug(data.name),
        category: categoryRow.slug.replace(/-/g, '_'),
        categoryId: categoryRow.id,
        inStock: data.stockQuantity > 0,
        badges: [],
        sellerId: req.user!.companyId!,
        status: 'pending',
        priceTiers: { create: priceTiers },
      },
      include: { priceTiers: true },
    });

    res.status(201).json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.error('Error creating seller product:', error);
    res.status(500).json({ error: 'Impossible de créer le produit' });
  }
});

// Modification du contenu : le produit repasse en attente de validation
router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.sellerId !== req.user!.companyId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }

    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Données invalides', details: parsed.error.issues });
    }
    const { priceTiers, category, ...data } = parsed.data;

    const categoryRow = await prisma.category.findFirst({ where: { slug: category, isActive: true } });
    if (!categoryRow) {
      return res.status(400).json({ error: 'Catégorie inconnue' });
    }

    const product = await prisma.$transaction(async (tx) => {
      await tx.priceTier.deleteMany({ where: { productId: existing.id } });
      return tx.product.update({
        where: { id: existing.id },
        data: {
          ...data,
          category: categoryRow.slug.replace(/-/g, '_'),
          categoryId: categoryRow.id,
          inStock: data.stockQuantity > 0,
          status: 'pending',
          rejectionReason: null,
          priceTiers: { create: priceTiers },
        },
        include: { priceTiers: true },
      });
    });

    await deleteReplacedImages(existing.images, product.images);
    await invalidateProductCache();
    res.json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.error('Error updating seller product:', error);
    res.status(500).json({ error: 'Impossible de modifier le produit' });
  }
});

// Stock : mise à jour rapide, sans nouvelle validation
router.patch('/products/:id/stock', async (req: Request, res: Response) => {
  try {
    const { stockQuantity } = req.body ?? {};
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ error: 'Quantité de stock invalide' });
    }
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.sellerId !== req.user!.companyId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { stockQuantity, inStock: stockQuantity > 0 },
    });
    await invalidateProductCache();
    res.json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.error('Error updating seller stock:', error);
    res.status(500).json({ error: 'Impossible de modifier le stock' });
  }
});

// Retirer / remettre un produit en vente, sans nouvelle validation
router.patch('/products/:id/active', async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body ?? {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Valeur invalide' });
    }
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.sellerId !== req.user!.companyId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    const product = await prisma.product.update({ where: { id: existing.id }, data: { isActive } });
    await invalidateProductCache();
    res.json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.error('Error toggling seller product:', error);
    res.status(500).json({ error: 'Impossible de modifier le produit' });
  }
});

// Suppression : si des commandes référencent le produit, il est seulement retiré de la vente
router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.sellerId !== req.user!.companyId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }

    const ordered = await prisma.orderItem.findFirst({ where: { productId: existing.id } });
    if (ordered) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { isActive: false, inStock: false, stockQuantity: 0 },
      });
      await invalidateProductCache();
      return res.json({ success: true, message: 'Produit désactivé (des commandes le référencent)' });
    }

    await prisma.product.delete({ where: { id: existing.id } });
    await deleteUploadedImages(existing.images);
    await invalidateProductCache();
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    console.error('Error deleting seller product:', error);
    res.status(500).json({ error: 'Impossible de supprimer le produit' });
  }
});

export default router;
