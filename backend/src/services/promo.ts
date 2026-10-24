import { randomInt } from 'node:crypto';
import type { PromoCode } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { PromoError, computeDiscount, normalizeCode, promoError, referralSettings } from '../lib/promo.js';
import { siteUrl } from '../lib/siteUrl.js';
import { sendReferralRewardEmail } from './emailService.js';
import { sendReferralRewardSms } from './smsNotifications.js';

// Codes promo et parrainage : vérification, réservation à la commande, libération à l'annulation, bons offerts
// aux parrains (règles dans lib/promo.ts).

export interface Buyer {
  userId: string | null;
  /** Compte professionnel : les commandes de l'entreprise comptent pour « première commande » */
  companyId: string | null;
}

async function contextFor(promo: PromoCode | null, buyer: Buyer, itemsSubtotal: number) {
  if (!buyer.userId) {
    return { userId: null, itemsSubtotal, previousOrders: 0, userRedemptions: 0, alreadyReferred: false };
  }
  const [previousOrders, userRedemptions, user] = await Promise.all([
    prisma.order.count({
      where: { status: { not: 'cancelled' }, ...(buyer.companyId ? { companyId: buyer.companyId } : { userId: buyer.userId }) },
    }),
    promo ? prisma.promoRedemption.count({ where: { promoCodeId: promo.id, userId: buyer.userId } }) : Promise.resolve(0),
    prisma.user.findUnique({ where: { id: buyer.userId }, select: { referredById: true } }),
  ]);
  return { userId: buyer.userId, itemsSubtotal, previousOrders, userRedemptions, alreadyReferred: !!user?.referredById };
}

/** Code applicable à ce panier et remise correspondante ; PromoError avec un message lisible sinon */
export async function resolvePromo(rawCode: string, buyer: Buyer, itemsSubtotal: number) {
  const code = normalizeCode(rawCode);
  const promo = code ? await prisma.promoCode.findUnique({ where: { code } }) : null;
  const error = promoError(promo, await contextFor(promo, buyer, itemsSubtotal));
  if (error) throw new PromoError(error);
  return { promo: promo!, discount: computeDiscount(promo!, itemsSubtotal) };
}

/**
 * Réserve une utilisation du code pour ce panier, juste avant de créer les commandes. Incrément conditionnel :
 * deux commandes simultanées ne dépassent jamais `maxUses`.
 */
export async function claimPromo(promo: PromoCode, params: { userId: string | null; checkoutGroup: string; discount: number }) {
  const { count } = await prisma.promoCode.updateMany({
    where: { id: promo.id, isActive: true, ...(promo.maxUses !== null ? { usedCount: { lt: promo.maxUses } } : {}) },
    data: { usedCount: { increment: 1 } },
  });
  if (count === 0) throw new PromoError('Ce code promo a déjà été entièrement utilisé');
  await prisma.promoRedemption.create({
    data: { promoCodeId: promo.id, userId: params.userId, checkoutGroup: params.checkoutGroup, discountAmount: params.discount },
  });
}

// Panier entièrement annulé (non payé dans le délai, annulé par l'admin) : le code redevient utilisable
export async function releasePromoIfCancelled(checkoutGroup: string | null): Promise<void> {
  if (!checkoutGroup) return;
  const redemption = await prisma.promoRedemption.findUnique({ where: { checkoutGroup } });
  if (!redemption || redemption.rewardIssuedAt) return;
  const active = await prisma.order.count({ where: { checkoutGroup, status: { not: 'cancelled' } } });
  if (active > 0) return;
  const { count } = await prisma.promoRedemption.deleteMany({ where: { id: redemption.id } });
  if (count > 0) {
    await prisma.promoCode.updateMany({
      where: { id: redemption.promoCodeId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }
}

// Sans lettres ni chiffres ambigus (0/O, 1/I/L) : le code est souvent recopié à la main
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomPart = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

async function createUniqueCode(prefix: string, data: Omit<Parameters<typeof prisma.promoCode.create>[0]['data'], 'code'>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.promoCode.create({ data: { ...data, code: `${prefix}-${randomPart(6)}` } as any });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error; // code déjà pris : on en tire un autre
    }
  }
  throw new Error('Impossible de générer un code unique');
}

/** Code de parrainage personnel du client (créé à la première demande) */
export async function getOrCreateReferralCode(userId: string): Promise<PromoCode> {
  const existing = await prisma.promoCode.findFirst({ where: { ownerUserId: userId, kind: 'referral' } });
  const { discountPercent, discountMax } = referralSettings();
  if (existing) {
    // Réglages modifiés depuis : le code suit la configuration actuelle
    if (existing.value !== discountPercent || existing.maxDiscount !== discountMax) {
      return prisma.promoCode.update({ where: { id: existing.id }, data: { value: discountPercent, maxDiscount: discountMax } });
    }
    return existing;
  }
  return createUniqueCode('TSENA', {
    kind: 'referral',
    type: 'percent',
    value: discountPercent,
    maxDiscount: discountMax,
    firstOrderOnly: true,
    perUserLimit: 1,
    ownerUserId: userId,
    description: 'Code de parrainage',
    isActive: discountPercent > 0,
  });
}

/**
 * Commande payée : si elle a utilisé un code de parrainage, le filleul est rattaché à son parrain et le parrain
 * reçoit un bon d'achat. Une seule fois par panier (réclamation conditionnelle de la ligne d'utilisation).
 */
export async function issueReferralReward(checkoutGroup: string | null, now = new Date()): Promise<void> {
  if (!checkoutGroup) return;
  const redemption = await prisma.promoRedemption.findUnique({
    where: { checkoutGroup },
    include: { promoCode: { select: { kind: true, ownerUserId: true, code: true } } },
  });
  const sponsorId = redemption?.promoCode.ownerUserId;
  if (!redemption || redemption.rewardIssuedAt || redemption.promoCode.kind !== 'referral' || !sponsorId) return;

  const claim = await prisma.promoRedemption.updateMany({
    where: { id: redemption.id, rewardIssuedAt: null },
    data: { rewardIssuedAt: now },
  });
  if (claim.count === 0) return;

  if (redemption.userId) {
    await prisma.user.updateMany({ where: { id: redemption.userId, referredById: null }, data: { referredById: sponsorId } });
  }

  const { rewardAmount, rewardDays } = referralSettings();
  if (rewardAmount <= 0) return;
  const sponsor = await prisma.user.findUnique({
    where: { id: sponsorId },
    select: { firstName: true, email: true, phone: true, verifiedPhone: true, deletedAt: true },
  });
  if (!sponsor || sponsor.deletedAt) return;

  const endsAt = new Date(now.getTime() + rewardDays * 24 * 60 * 60 * 1000);
  const reward = await createUniqueCode('MERCI', {
    kind: 'reward',
    type: 'fixed',
    value: rewardAmount,
    maxUses: 1,
    perUserLimit: 1,
    endsAt,
    ownerUserId: sponsorId,
    description: 'Bon de parrainage',
  });

  sendReferralRewardSms({ phone: sponsor.verifiedPhone ?? sponsor.phone, code: reward.code, amount: rewardAmount, endsAt });
  if (sponsor.email) {
    sendReferralRewardEmail({
      firstName: sponsor.firstName,
      contactEmail: sponsor.email,
      code: reward.code,
      amount: rewardAmount,
      endsAt,
      shopUrl: `${siteUrl()}/produits`,
    }).catch((err) => console.error('Failed to send referral reward email:', err));
  }
}
