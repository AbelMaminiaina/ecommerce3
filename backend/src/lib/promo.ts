import type { PromoCode } from '@prisma/client';

// Codes promo et parrainage (règles pures ; lecture / écriture en base dans services/promo.ts).
//
// La remise porte sur le montant des articles, jamais sur la livraison, et elle est prise en charge par la
// plateforme : le vendeur reçoit le même montant que sans remise (lib/commission.ts).
//
// Parrainage (réglages ci-dessous, 0 = désactivé) :
//  - chaque client a un code personnel ; un nouveau client qui l'utilise sur sa PREMIÈRE commande obtient
//    REFERRAL_DISCOUNT_PERCENT % de remise (plafonnée à REFERRAL_DISCOUNT_MAX Ar) ;
//  - quand cette commande est payée, le parrain reçoit un bon d'achat de REFERRAL_REWARD_AMOUNT Ar, valable
//    REFERRAL_REWARD_DAYS jours.

function intSetting(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? Math.round(parsed) : fallback;
}

export const referralSettings = () => ({
  discountPercent: intSetting('REFERRAL_DISCOUNT_PERCENT', 10, 90),
  discountMax: intSetting('REFERRAL_DISCOUNT_MAX', 20_000, 10_000_000),
  rewardAmount: intSetting('REFERRAL_REWARD_AMOUNT', 5_000, 10_000_000),
  rewardDays: intSetting('REFERRAL_REWARD_DAYS', 90, 3650),
});

// « tsena-ab 12 » -> « TSENA-AB12 »
export const normalizeCode = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, '');

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export class PromoError extends Error {}

type PromoRules = Pick<
  PromoCode,
  'kind' | 'type' | 'value' | 'maxDiscount' | 'minSubtotal' | 'startsAt' | 'endsAt' | 'maxUses' | 'usedCount' | 'perUserLimit' | 'firstOrderOnly' | 'isActive' | 'ownerUserId'
>;

// Remise (Ariary, entier) pour ce montant d'articles
export function computeDiscount(promo: Pick<PromoRules, 'type' | 'value' | 'maxDiscount'>, itemsSubtotal: number): number {
  const raw = promo.type === 'percent' ? Math.floor((itemsSubtotal * promo.value) / 100) : promo.value;
  const capped = promo.type === 'percent' && promo.maxDiscount ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, itemsSubtotal));
}

export interface PromoContext {
  userId: string | null;
  itemsSubtotal: number;
  /** Commandes non annulées déjà passées par ce client (code « première commande ») */
  previousOrders: number;
  /** Utilisations de CE code par ce client */
  userRedemptions: number;
  /** Le client a déjà été parrainé (par n'importe quel code) */
  alreadyReferred: boolean;
  now?: Date;
}

const formatAr = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;

/** Message d'erreur si le code ne peut pas s'appliquer à ce panier ; null sinon */
export function promoError(promo: PromoRules | null, ctx: PromoContext): string | null {
  const now = ctx.now ?? new Date();
  if (!promo || !promo.isActive) return 'Ce code promo est invalide';
  if (promo.startsAt && promo.startsAt > now) return "Ce code promo n'est pas encore valable";
  if (promo.endsAt && promo.endsAt <= now) return 'Ce code promo a expiré';
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return 'Ce code promo a déjà été entièrement utilisé';

  // Codes personnels : client connecté obligatoire
  if (promo.kind !== 'standard' && !ctx.userId) return 'Connectez-vous pour utiliser ce code';
  if (promo.kind === 'referral') {
    if (promo.ownerUserId === ctx.userId) return 'Vous ne pouvez pas utiliser votre propre code de parrainage : partagez-le !';
    if (ctx.alreadyReferred) return 'Vous avez déjà été parrainé';
  }
  if (promo.kind === 'reward' && promo.ownerUserId !== ctx.userId) return 'Ce bon d’achat est réservé à un autre client';

  if ((promo.firstOrderOnly || promo.kind === 'referral') && ctx.previousOrders > 0) {
    return 'Ce code est réservé à une première commande';
  }
  if (ctx.userId && ctx.userRedemptions >= promo.perUserLimit) return 'Vous avez déjà utilisé ce code';
  if (ctx.itemsSubtotal < promo.minSubtotal) return `Ce code s'applique dès ${formatAr(promo.minSubtotal)} d'articles`;
  return null;
}

/**
 * Répartit une remise entre les commandes d'un panier (une par vendeur), au prorata de leur montant d'articles.
 * Montants entiers dont la somme fait exactement la remise ; jamais plus que le montant d'une commande.
 */
export function allocateDiscount(rawDiscount: number, subtotals: number[]): number[] {
  const total = subtotals.reduce((sum, s) => sum + s, 0);
  // Jamais plus que les articles (sinon la boucle ci-dessous ne pourrait pas tout répartir)
  const discount = Math.min(rawDiscount, total);
  if (discount <= 0 || total <= 0) return subtotals.map(() => 0);
  const shares = subtotals.map((s) => Math.floor((discount * s) / total));
  let rest = discount - shares.reduce((sum, s) => sum + s, 0);
  // Les Ariary restants vont aux plus grosses commandes
  const order = subtotals.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length) {
    const i = order[k][1];
    if (shares[i] < subtotals[i]) {
      shares[i] += 1;
      rest -= 1;
    }
  }
  return shares;
}

// Description lisible d'un code (« -10 % (max 20 000 Ar) », « -5 000 Ar »)
export function describePromo(promo: Pick<PromoRules, 'type' | 'value' | 'maxDiscount'>): string {
  return promo.type === 'percent'
    ? `-${promo.value} %${promo.maxDiscount ? ` (max ${formatAr(promo.maxDiscount)})` : ''}`
    : `-${formatAr(promo.value)}`;
}
