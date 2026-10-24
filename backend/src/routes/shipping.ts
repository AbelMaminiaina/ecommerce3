import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { sendValidationError } from '../lib/validation.js';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COSTS } from '../lib/shipping.js';
import { localDeliveryCities, pickupPointView } from '../lib/delivery.js';

const router = Router();

// Livraison : options proposées au moment de payer (public) ; zones de province et points relais (administration).

const zoneView = (z: { id: string; name: string; cities: string[]; price: number; delay: string; isDefault: boolean }) => ({
  id: z.id,
  name: z.name,
  cities: z.cities,
  price: z.price,
  delay: z.delay,
  isDefault: z.isDefault,
});

// Le site calcule l'aperçu des frais avec ces données ; la commande les recalcule côté serveur
router.get('/options', async (_req: Request, res: Response) => {
  try {
    const [zones, pickupPoints] = await Promise.all([
      prisma.shippingZone.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.pickupPoint.findMany({ where: { isActive: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }] }),
    ]);
    res.json({
      localCities: localDeliveryCities(),
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      costs: { standard: SHIPPING_COSTS.standard, express: SHIPPING_COSTS.express },
      zones: zones.map(zoneView),
      pickupPoints: pickupPoints.map(pickupPointView),
    });
  } catch (error) {
    console.error('Error fetching shipping options:', error);
    res.status(500).json({ error: 'Failed to fetch shipping options' });
  }
});

// ---------- Administration ----------

const PRICE = 'Tarif invalide (en Ariary)';
const zoneSchema = z.object({
  name: z.string({ message: 'Nom requis' }).trim().min(2, 'Nom requis').max(60),
  cities: z.array(z.string().trim().min(2).max(60)).max(200).default([]),
  price: z.number({ message: PRICE }).int(PRICE).min(0, PRICE).max(1_000_000, PRICE),
  delay: z.string({ message: 'Délai requis' }).trim().min(2, 'Délai requis').max(40),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

const pointSchema = z.object({
  name: z.string({ message: 'Nom requis' }).trim().min(2, 'Nom requis').max(80),
  address: z.string({ message: 'Adresse requise' }).trim().min(3, 'Adresse requise').max(200),
  city: z.string({ message: 'Ville requise' }).trim().min(2, 'Ville requise').max(60),
  phone: z.string().trim().max(30).nullish(),
  openingHours: z.string().trim().max(120).nullish(),
  instructions: z.string().trim().max(300).nullish(),
  fee: z.number({ message: PRICE }).int(PRICE).min(0, PRICE).max(1_000_000, PRICE).optional(),
  isActive: z.boolean().optional(),
});

router.get('/admin', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const [zones, pickupPoints] = await Promise.all([
      prisma.shippingZone.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.pickupPoint.findMany({ orderBy: [{ city: 'asc' }, { name: 'asc' }], include: { _count: { select: { orders: true } } } }),
    ]);
    res.json({
      localCities: localDeliveryCities(),
      zones: zones.map((z) => ({ ...zoneView(z), isActive: z.isActive, sortOrder: z.sortOrder })),
      pickupPoints: pickupPoints.map((p) => ({ ...pickupPointView(p), isActive: p.isActive, orders: p._count.orders })),
    });
  } catch (error) {
    console.error('Error fetching shipping settings:', error);
    res.status(500).json({ error: 'Failed to fetch shipping settings' });
  }
});

// Une seule zone par défaut : en désigner une nouvelle retire le rôle à l'ancienne
async function saveZone(id: string | null, data: z.infer<typeof zoneSchema>) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.shippingZone.updateMany({ where: { isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
    return id ? tx.shippingZone.update({ where: { id }, data }) : tx.shippingZone.create({ data });
  });
}

router.post('/admin/zones', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const zone = await saveZone(null, zoneSchema.parse(req.body ?? {}));
    res.status(201).json({ success: true, zone });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error creating shipping zone:', error);
    res.status(500).json({ error: 'Failed to create shipping zone' });
  }
});

router.put('/admin/zones/:id', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const data = zoneSchema.parse(req.body ?? {});
    const existing = await prisma.shippingZone.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Zone introuvable' });
    res.json({ success: true, zone: await saveZone(existing.id, data) });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating shipping zone:', error);
    res.status(500).json({ error: 'Failed to update shipping zone' });
  }
});

router.post('/admin/pickup-points', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const point = await prisma.pickupPoint.create({ data: pointSchema.parse(req.body ?? {}) });
    res.status(201).json({ success: true, pickupPoint: point });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error creating pickup point:', error);
    res.status(500).json({ error: 'Failed to create pickup point' });
  }
});

router.put('/admin/pickup-points/:id', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const data = pointSchema.parse(req.body ?? {});
    const existing = await prisma.pickupPoint.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Point relais introuvable' });
    // Désactivé plutôt que supprimé : les commandes passées gardent leur point relais
    res.json({ success: true, pickupPoint: await prisma.pickupPoint.update({ where: { id: existing.id }, data }) });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating pickup point:', error);
    res.status(500).json({ error: 'Failed to update pickup point' });
  }
});

export default router;
