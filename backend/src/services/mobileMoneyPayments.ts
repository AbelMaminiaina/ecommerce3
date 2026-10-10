import type { Order, PaymentAttempt } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { OperatorError } from '../lib/operatorHttp.js';
import { OPERATORS, getAutomaticOperator, getOperator, type OperatorAdapter, type OperatorId } from '../lib/operators.js';
import { getMvolaConfig } from '../lib/mvola.js';
import { getOrangeConfig } from '../lib/orangeMoney.js';
import { getAirtelConfig } from '../lib/airtelMoney.js';
import { getStripeConfig } from '../lib/stripe.js';
import { getPaypalConfig } from '../lib/paypal.js';
import { normalizeMalagasyMobile } from '../lib/phone.js';
import type { GroupOrder } from '../lib/paymentGroup.js';
import { markOrdersPaid, type BuyerOrder } from './paymentSettlement.js';

// Paiement automatique par l'API d'un prestataire (MVola, Orange Money, Airtel Money, Stripe, PayPal) : le site
// vérifie le résultat AUPRÈS DU PRESTATAIRE (requête authentifiée) puis passe les commandes en « payées ».
//
// Règles de sécurité (les mêmes pour tous les opérateurs) :
//  - on ne se fie jamais au navigateur du client ni au message de rappel (callback) de l'opérateur : ils ne servent
//    qu'à déclencher une vérification ; seul le statut renvoyé par l'API authentifiée compte ;
//  - le montant est recoupé (et, quand l'opérateur fournit le détail de la transaction, le compte crédité) ; au
//    moindre écart la commande n'est PAS validée automatiquement (statut « review », un administrateur tranche) ;
//  - la validation est « réclamée » par une mise à jour conditionnelle : un paiement n'est réglé qu'une fois,
//    même si le client, le rappel et la tâche de fond le vérifient en même temps.

export class PaymentHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PaymentHttpError';
  }
}

const NO_TRACKING_ID_TTL_MS = 2 * 60 * 1000;
const TIMED_OUT_RECHECK_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_REASON_PREFIX = 'Délai de confirmation dépassé';
const MAX_ATTEMPTS_PER_ORDER_PER_HOUR = 5;
const MAX_ATTEMPTS_PER_PHONE_PER_HOUR = 3;
const RECONCILE_INTERVAL_MS = 30 * 1000;

const sum = (orders: { total: number }[]) => orders.reduce((acc, o) => acc + o.total, 0);
const isPayable = (o: Order) => o.status !== 'cancelled' && o.paymentStatus !== 'paid';
// Repli proposé au client quand le paiement instantané échoue (la carte et PayPal n'ont pas de paiement manuel)
const fallbackHint = (operator: OperatorAdapter) =>
  operator.kind === 'mobile_money' ? ' ou payez manuellement avec une référence' : '';
const timeoutReason = (operator: OperatorAdapter) => `${TIMEOUT_REASON_PREFIX} (${Math.round(operator.pendingTtlMs / 60_000)} min)`;

// Adresse publique du site (retour du client après une page de paiement externe)
const siteUrl = () => (process.env.PUBLIC_SITE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');

function operatorOf(attempt: PaymentAttempt): OperatorAdapter | null {
  return getOperator(attempt.provider);
}

async function groupOfAttempt(attempt: PaymentAttempt): Promise<BuyerOrder[]> {
  return prisma.order.findMany({
    where: attempt.checkoutGroup ? { checkoutGroup: attempt.checkoutGroup } : { id: attempt.orderId },
    include: {
      company: { select: { name: true, contactEmail: true, contactPhone: true } },
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function markReview(attempt: PaymentAttempt, reason: string): Promise<PaymentAttempt> {
  console.warn(`Paiement ${attempt.provider} à vérifier (tentative ${attempt.id}) : ${reason}`);
  return prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'review', failureReason: reason } });
}

// Échec (refus, abandon, expiration) : les commandes redeviennent « à payer » et le client peut réessayer.
// La date limite de paiement n'est PAS prolongée (elle court depuis la création de la commande).
async function failAttempt(attempt: PaymentAttempt, reason: string): Promise<PaymentAttempt> {
  const claim = await prisma.paymentAttempt.updateMany({
    where: { id: attempt.id, status: 'pending' },
    data: { status: 'failed', providerStatus: 'failed', failureReason: reason },
  });
  const operator = operatorOf(attempt);
  if (claim.count > 0 && operator) {
    await prisma.order.updateMany({
      where: {
        ...(attempt.checkoutGroup ? { checkoutGroup: attempt.checkoutGroup } : { id: attempt.orderId }),
        paymentStatus: 'submitted',
        paymentReference: { startsWith: operator.referencePrefix },
      },
      data: {
        paymentStatus: 'awaiting',
        paymentReference: null,
        paymentPayerPhone: null,
        paymentSubmittedAt: null,
        paymentRejectionReason: reason,
      },
    });
  }
  return (await prisma.paymentAttempt.findUnique({ where: { id: attempt.id } })) ?? attempt;
}

// L'opérateur annonce « payé » : recoupe le montant, puis règle les commandes
async function settleCompletedAttempt(attempt: PaymentAttempt, operator: OperatorAdapter, providerTransactionId?: string): Promise<PaymentAttempt> {
  const transactionId = providerTransactionId ?? attempt.transactionId ?? null;
  const claim = await prisma.paymentAttempt.updateMany({
    where: { id: attempt.id, status: 'pending' },
    data: { status: 'completed', providerStatus: 'completed', transactionId, failureReason: null },
  });
  const current = async () => (await prisma.paymentAttempt.findUnique({ where: { id: attempt.id } })) ?? attempt;
  if (claim.count === 0) return current(); // déjà traité par une autre vérification

  try {
    const group = await groupOfAttempt(attempt);
    const unpaid = group.filter(isPayable);
    if (unpaid.length === 0) return current(); // déjà payé (par exemple confirmé à la main entre-temps)

    let problem: string | null = null;
    const expected = sum(unpaid);
    if (expected !== attempt.amount) {
      problem = `Le total du panier a changé (${expected} Ar à payer, ${attempt.amount} Ar demandés à ${operator.label})`;
    } else if (operator.verify) {
      problem = await operator.verify(attempt, transactionId);
    }
    if (problem) return markReview(attempt, problem);

    await markOrdersPaid({
      orders: unpaid,
      buyerOrder: group[0],
      extra: { paymentReference: `${operator.referencePrefix}${transactionId ?? attempt.id}`, paymentPayerPhone: attempt.payerPhone || undefined },
    });
    return current();
  } catch (error) {
    console.error(`${operator.label} settlement failed:`, error);
    return markReview(attempt, 'Erreur pendant la validation du paiement');
  }
}

// Interroge l'opérateur sur une tentative en attente et en tire les conséquences. Sans danger à appeler souvent.
export async function reconcileAttempt(attemptId: string): Promise<PaymentAttempt | null> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.status !== 'pending') return attempt;

  const operator = operatorOf(attempt);
  if (!operator || !operator.isConfigured()) return attempt;
  const age = Date.now() - attempt.createdAt.getTime();

  if (!attempt.serverCorrelationId) {
    return age > NO_TRACKING_ID_TTL_MS ? failAttempt(attempt, `La demande de paiement n’a pas abouti chez ${operator.label}`) : attempt;
  }

  let result;
  try {
    result = await operator.getStatus(attempt);
  } catch (error) {
    // Erreur réseau / opérateur indisponible : on réessaiera au prochain passage, sans conclure quoi que ce soit
    if (operator.isUnknownTransaction(error) && age > NO_TRACKING_ID_TTL_MS) {
      return failAttempt(attempt, `Transaction introuvable chez ${operator.label}`);
    }
    console.warn(`${operator.label} status check failed for ${attempt.id}:`, error instanceof Error ? error.message : error);
    return age > operator.pendingTtlMs ? failAttempt(attempt, timeoutReason(operator)) : attempt;
  }

  if (result.status === 'completed') return settleCompletedAttempt(attempt, operator, result.transactionId);
  if (result.status === 'failed') return failAttempt(attempt, `Paiement refusé, annulé ou expiré sur ${operator.label}`);
  return age > operator.pendingTtlMs ? failAttempt(attempt, timeoutReason(operator)) : attempt;
}

// Lance un paiement pour un panier, avec l'opérateur choisi à la commande : envoie la demande sur le téléphone du
// client (MVola, Airtel) ou prépare la page de paiement de l'opérateur (Orange Money)
export async function initiateAutoPayment(params: {
  group: GroupOrder[];
  anchor: GroupOrder;
  payerPhone?: string;
  /** Adresse publique pour le retour du client (démo : déduite de la requête) ; sinon celle de la configuration */
  siteUrl?: string;
}): Promise<{ attempt: PaymentAttempt; reused: boolean }> {
  const operator = getAutomaticOperator(params.anchor.paymentMethod);
  if (!operator) {
    throw new PaymentHttpError(
      params.anchor.paymentMethod && getOperator(params.anchor.paymentMethod) ? 503 : 400,
      params.anchor.paymentMethod && getOperator(params.anchor.paymentMethod)
        ? 'Le paiement automatique n’est pas disponible pour le moment.'
        : 'Cette commande n’est pas à payer en ligne.'
    );
  }

  let payer = '';
  if (operator.flow === 'push') {
    const normalized = normalizeMalagasyMobile(params.payerPhone ?? '');
    if (!normalized || !operator.isValidPayer(normalized)) {
      throw new PaymentHttpError(400, `Numéro ${operator.label} invalide : il doit commencer par ${operator.phonePrefixes}.`);
    }
    payer = normalized;
  }

  const payable = params.group.filter(isPayable);
  if (payable.length === 0) throw new PaymentHttpError(409, 'Cette commande est déjà payée ou annulée.');
  const groupIds = params.group.map((o) => o.id);

  // Une demande est déjà en cours : on la reprend au lieu d'en envoyer une seconde
  const existing = await prisma.paymentAttempt.findFirst({
    where: { orderId: { in: groupIds }, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const fresh = await reconcileAttempt(existing.id);
    if (fresh && fresh.status === 'pending') return { attempt: fresh, reused: true };
    if (fresh && fresh.status === 'completed') throw new PaymentHttpError(409, 'Cette commande est déjà payée.');
  }

  // Chaque demande fait sonner un téléphone : on empêche d'en harceler un (par commande, par numéro)
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [byOrder, byPhone] = await Promise.all([
    prisma.paymentAttempt.count({ where: { orderId: { in: groupIds }, createdAt: { gte: since } } }),
    payer ? prisma.paymentAttempt.count({ where: { payerPhone: payer, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (byOrder >= MAX_ATTEMPTS_PER_ORDER_PER_HOUR || byPhone >= MAX_ATTEMPTS_PER_PHONE_PER_HOUR) {
    throw new PaymentHttpError(429, `Trop de tentatives de paiement. Réessayez dans une heure${fallbackHint(operator)}.`);
  }

  const amount = sum(payable);
  const created = await prisma.paymentAttempt.create({
    data: {
      provider: operator.id,
      orderId: params.anchor.id,
      checkoutGroup: params.anchor.checkoutGroup,
      amount,
      payerPhone: payer,
      status: 'pending',
    },
  });

  // Retour sur la page de confirmation (elle affiche le paiement). Ni e-mail ni identifiant sensible dans l'adresse :
  // elle transite par l'opérateur ; le navigateur retrouve l'e-mail du visiteur dans sa session.
  const back = `${(params.siteUrl ?? siteUrl()).replace(/\/+$/, '')}/checkout/confirmation?order=${encodeURIComponent(params.group.map((o) => o.orderNumber).join(','))}`;
  let result;
  try {
    result = await operator.initiate({
      attemptId: created.id,
      amount,
      orderNumber: params.anchor.orderNumber,
      payerNumber: payer,
      returnUrl: `${back}&paiement=retour`,
      cancelUrl: `${back}&paiement=annule`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `Erreur ${operator.label}`;
    await prisma.paymentAttempt.update({ where: { id: created.id }, data: { status: 'failed', failureReason: message.slice(0, 300) } });
    const retriable = error instanceof OperatorError && error.retriable;
    throw new PaymentHttpError(
      retriable ? 503 : 502,
      retriable
        ? `${operator.label} est momentanément indisponible. Réessayez dans un instant${fallbackHint(operator)}.`
        : operator.kind === 'mobile_money'
          ? `${operator.label} a refusé la demande de paiement.${payer ? ' Vérifiez votre numéro ou' : ''} Vous pouvez payer manuellement avec une référence.`
          : `${operator.label} a refusé la demande de paiement. Réessayez dans un instant.`
    );
  }

  const attempt = await prisma.paymentAttempt.update({
    where: { id: created.id },
    data: {
      serverCorrelationId: result.trackingId,
      transactionId: result.transactionId ?? null,
      paymentUrl: result.paymentUrl ?? null,
      notifToken: result.notifToken ?? null,
      providerAmount: result.charged?.amount ?? null,
      providerCurrency: result.charged?.currency ?? null,
      providerStatus: result.status,
    },
  });

  // Les commandes attendent maintenant la confirmation du client : elles ne peuvent plus expirer pendant ce temps
  await prisma.order.updateMany({
    where: { id: { in: payable.map((o) => o.id) } },
    data: {
      paymentStatus: 'submitted',
      paymentReference: `${operator.referencePrefix}${attempt.id.slice(0, 8)}`,
      paymentPayerPhone: payer || null,
      paymentSubmittedAt: new Date(),
      paymentRejectionReason: null,
    },
  });

  // L'opérateur a pu répondre « déjà payé » immédiatement
  if (result.status !== 'pending') {
    const settled = await reconcileAttempt(attempt.id);
    if (settled) return { attempt: settled, reused: false };
  }
  return { attempt, reused: false };
}

// Message de rappel d'un opérateur : NON signé, donc jamais cru sur parole. Il sert uniquement à retrouver la
// tentative concernée et à déclencher une vérification auprès de l'opérateur.
export async function handleOperatorCallback(operatorId: OperatorId, body: unknown): Promise<boolean> {
  const operator = OPERATORS[operatorId];
  const conditions = operator.callbackLookup((body ?? {}) as Record<string, unknown>);
  if (conditions.length === 0) return false;

  const attempt = await prisma.paymentAttempt.findFirst({ where: { provider: operatorId, OR: conditions } });
  if (!attempt) return false;
  await reconcileAttempt(attempt.id);
  return true;
}

// Tâche de fond : vérifie les demandes en attente même si le client a fermé la page, et surveille pendant 24 h
// celles abandonnées par délai au cas où le client aurait finalement payé.
export async function reconcilePendingAttempts(): Promise<number> {
  if (!Object.values(OPERATORS).some((o) => o.isConfigured())) return 0;

  const pending = await prisma.paymentAttempt.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 10_000) } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  for (const attempt of pending) {
    await reconcileAttempt(attempt.id).catch((err) => console.error('Payment reconcile failed:', err));
  }

  const timedOut = await prisma.paymentAttempt.findMany({
    where: {
      status: 'failed',
      failureReason: { startsWith: TIMEOUT_REASON_PREFIX },
      serverCorrelationId: { not: null },
      updatedAt: { gt: new Date(Date.now() - TIMED_OUT_RECHECK_MS) },
    },
    take: 50,
  });
  for (const attempt of timedOut) {
    const operator = operatorOf(attempt);
    if (!operator || !operator.isConfigured()) continue;
    try {
      // Lecture seule : une demande abandonnée n'est jamais encaissée après coup (PayPal capture lors de la vérification)
      const status = await operator.getStatus(attempt, { readOnly: true });
      if (status.status === 'completed') {
        await markReview(attempt, `${operator.label} indique un paiement confirmé APRÈS l’abandon de la demande : à vérifier et confirmer à la main`);
      }
    } catch {
      // Opérateur indisponible : nouvel essai au prochain passage
    }
  }
  return pending.length;
}

export function startAutoPaymentReconcileJob(): void {
  const configs: Record<OperatorId, () => { sandbox: boolean; baseUrl: string } | null> = {
    mvola: getMvolaConfig,
    orange_money: getOrangeConfig,
    airtel_money: getAirtelConfig,
    stripe: getStripeConfig,
    paypal: getPaypalConfig,
  };
  let enabled = 0;
  for (const operator of Object.values(OPERATORS)) {
    const config = configs[operator.id]();
    if (!config) {
      console.log(
        `Paiement ${operator.label} automatique : non configuré${operator.kind === 'mobile_money' ? ' (paiement manuel par référence uniquement)' : ' (moyen de paiement non proposé)'}`
      );
      continue;
    }
    enabled++;
    console.log(`Paiement ${operator.label} automatique : activé (${config.sandbox ? 'BAC À SABLE' : 'PRODUCTION'}, ${config.baseUrl})`);
  }
  if (enabled === 0) return;
  const run = () => reconcilePendingAttempts().catch((err) => console.error('Payment reconcile job failed:', err));
  setInterval(run, RECONCILE_INTERVAL_MS).unref();
}
