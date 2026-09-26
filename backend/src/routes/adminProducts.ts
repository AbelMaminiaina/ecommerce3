import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { sendValidationError, singleMessage } from '../lib/validation.js';
import { invalidateProductCache } from '../lib/cache.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';

// Modération des produits publiés par les entreprises vendeuses (administrateur uniquement).
const router = Router();
router.use(authenticate, requirePlatformAdmin);

const listQuerySchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') });
const rejectSchema = z.object({ reason: z.string().trim().min(3) });

// ?status=pending (défaut) | approved | rejected | all : uniquement les produits de vendeurs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = listQuerySchema.parse(req.query, singleMessage('Statut invalide'));

    const products = await prisma.product.findMany({
      where: { sellerId: { not: null }, ...(status === 'all' ? {} : { status }) },
      include: {
        priceTiers: { orderBy: { minQty: 'asc' } },
        seller: { select: { id: true, name: true, contactEmail: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      products: products.map((p) => ({ ...p, category: p.category.replace(/_/g, '-') })),
      total: products.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error fetching products for moderation:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.patch('/:id/approve', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || !existing.sellerId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { status: 'approved', rejectionReason: null },
    });
    await invalidateProductCache();
    res.json({ success: true, product });
  } catch (error) {
    console.error('Error approving product:', error);
    res.status(500).json({ error: 'Impossible de valider le produit' });
  }
});

router.patch('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { reason } = rejectSchema.parse(req.body ?? {}, singleMessage('Un motif de refus est requis'));
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || !existing.sellerId) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { status: 'rejected', rejectionReason: reason },
    });
    await invalidateProductCache();
    res.json({ success: true, product });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error rejecting product:', error);
    res.status(500).json({ error: 'Impossible de refuser le produit' });
  }
});

export default router;
