import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuthenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { sendValidationError } from '../lib/validation.js';
import { siteUrl } from '../lib/siteUrl.js';
import { PROMO_CODE_PATTERN, PromoError, describePromo, normalizeCode, referralSettings } from '../lib/promo.js';
import { getOrCreateReferralCode, resolvePromo } from '../services/promo.js';

const router = Router();

// Codes promo : aperçu de la remise au moment de payer, parrainage du client, gestion par l'administrateur.

// Contre l'essai de codes en série
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Trop de codes essayés. Réessayez dans quelques minutes.',
});

const previewSchema = z.object({
  code: z.string({ message: 'Code promo requis' }).trim().min(1, 'Code promo requis').max(40),
  // Montant des articles affiché au client : indicatif, la commande recalcule tout avec les prix du serveur
  itemsSubtotal: z.number({ message: 'Montant invalide' }).int().min(0).max(1_000_000_000),
});

router.post('/preview', optionalAuthenticate, previewLimiter, async (req: Request, res: Response) => {
  try {
    const { code, itemsSubtotal } = previewSchema.parse(req.body ?? {});
    const { promo, discount } = await resolvePromo(
      code,
      { userId: req.user?.userId ?? null, companyId: req.user?.companyId ?? null },
      itemsSubtotal
    );
    res.json({
      code: promo.code,
      discount,
      label: promo.kind === 'referral' ? `Parrainage ${describePromo(promo)}` : describePromo(promo),
      description: promo.description,
    });
  } catch (error) {
    if (error instanceof PromoError) return res.status(400).json({ error: error.message });
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error previewing promo code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mon parrainage : code personnel, lien à partager, filleuls et bons d'achat gagnés
router.get('/referral', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const settings = referralSettings();
    const code = await getOrCreateReferralCode(userId);
    const [referrals, rewards] = await Promise.all([
      prisma.promoRedemption.count({ where: { promoCodeId: code.id, rewardIssuedAt: { not: null } } }),
      prisma.promoCode.findMany({
        where: { ownerUserId: userId, kind: 'reward' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const now = new Date();

    res.json({
      enabled: settings.discountPercent > 0,
      code: code.code,
      link: `${siteUrl()}/?ref=${encodeURIComponent(code.code)}`,
      discountPercent: settings.discountPercent,
      discountMax: settings.discountMax,
      rewardAmount: settings.rewardAmount,
      referrals,
      rewards: rewards.map((r) => ({
        code: r.code,
        amount: r.value,
        endsAt: r.endsAt,
        status: r.usedCount >= (r.maxUses ?? 1) ? 'used' : r.endsAt && r.endsAt <= now ? 'expired' : 'available',
      })),
    });
  } catch (error) {
    console.error('Error fetching referral:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Administration ----------

const PERCENT = 'Pourcentage entre 1 et 90';
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), { message: 'Date invalide' })
  .transform((v) => (v ? new Date(v) : null));

const createSchema = z
  .object({
    code: z
      .string({ message: 'Code requis' })
      .transform(normalizeCode)
      .refine((v) => PROMO_CODE_PATTERN.test(v), { message: 'Code de 3 à 30 caractères : lettres, chiffres, - ou _' }),
    type: z.enum(['percent', 'fixed'], { message: 'Type de remise invalide' }),
    value: z.number({ message: 'Valeur invalide' }).int('Valeur invalide').positive('Valeur invalide'),
    maxDiscount: z.number().int().positive().nullish(),
    minSubtotal: z.number().int().min(0).optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    maxUses: z.number().int().positive().nullish(),
    perUserLimit: z.number().int().min(1).max(100).optional(),
    firstOrderOnly: z.boolean().optional(),
    description: z.string().trim().max(200).nullish(),
  })
  .refine((d) => d.type !== 'percent' || d.value <= 90, { message: PERCENT, path: ['value'] })
  .refine((d) => !d.startsAt || !d.endsAt || d.startsAt < d.endsAt, { message: 'La fin doit être après le début', path: ['endsAt'] });

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  endsAt: optionalDate,
  maxUses: z.number().int().positive().nullish(),
  description: z.string().trim().max(200).nullish(),
});

// Codes de l'administrateur (les codes de parrainage et bons d'achat se gèrent seuls), avec leur bilan
router.get('/admin', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const codes = await prisma.promoCode.findMany({ where: { kind: 'standard' }, orderBy: { createdAt: 'desc' }, take: 300 });
    const totals = await prisma.promoRedemption.groupBy({
      by: ['promoCodeId'],
      where: { promoCodeId: { in: codes.map((c) => c.id) } },
      _sum: { discountAmount: true },
    });
    const referral = await prisma.promoRedemption.aggregate({
      where: { promoCode: { kind: { in: ['referral', 'reward'] } } },
      _count: true,
      _sum: { discountAmount: true },
    });

    res.json({
      codes: codes.map((c) => ({
        ...c,
        label: describePromo(c),
        totalDiscount: totals.find((t) => t.promoCodeId === c.id)?._sum.discountAmount ?? 0,
      })),
      // Coût du parrainage pour la plateforme (remises des filleuls + bons des parrains utilisés)
      referral: { uses: referral._count, totalDiscount: referral._sum.discountAmount ?? 0, settings: referralSettings() },
    });
  } catch (error) {
    console.error('Error fetching promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

router.post('/admin', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body ?? {});
    const promo = await prisma.promoCode.create({
      data: {
        ...data,
        maxDiscount: data.type === 'percent' ? data.maxDiscount ?? null : null,
        maxUses: data.maxUses ?? null,
        kind: 'standard',
      },
    });
    res.status(201).json({ success: true, code: { ...promo, label: describePromo(promo), totalDiscount: 0 } });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Ce code existe déjà' });
    console.error('Error creating promo code:', error);
    res.status(500).json({ error: 'Failed to create promo code' });
  }
});

router.patch('/admin/:id', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body ?? {});
    const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.kind !== 'standard') return res.status(404).json({ error: 'Code introuvable' });
    const promo = await prisma.promoCode.update({
      where: { id: existing.id },
      // Champs absents : inchangés (endsAt: null retire la date de fin)
      data: Object.fromEntries(Object.entries(data).filter(([key]) => key in (req.body ?? {}))),
    });
    res.json({ success: true, code: { ...promo, label: describePromo(promo) } });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error updating promo code:', error);
    res.status(500).json({ error: 'Failed to update promo code' });
  }
});

export default router;
