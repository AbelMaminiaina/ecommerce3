import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Order, PaymentStatus } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuthenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { acceptsManualPayment, getPaymentMethod, getPaymentMethods, paymentMethodLabel } from '../lib/payments.js';
import { orderExpiresAt } from '../lib/orderExpiry.js';
import { expireUnpaidOrders } from '../services/orderExpiry.js';
import { sendPaymentRejectedEmail } from '../services/emailService.js';
import { canAccess, loadGroup, type GroupOrder } from '../lib/paymentGroup.js';
import { buyerOf, markOrdersPaid } from '../services/paymentSettlement.js';
import { getAutomaticOperator, getOperator, isApiReference } from '../lib/operators.js';
import { reconcileAttempt } from '../services/mobileMoneyPayments.js';
import { isDemoPayments } from '../services/demoPayments.js';
import { presentedAttempt } from '../lib/attemptPresentation.js';

const router = Router();

// Paiement Mobile Money vérifié manuellement : le client envoie l'argent au numéro marchand puis
// transmet la référence de la transaction ; un administrateur confirme ou refuse. (La carte bancaire et PayPal se
// paient uniquement en ligne : voir routes/autoPayments.ts.)
// Toutes les commandes d'un même panier (checkoutGroup) sont réglées par un seul paiement.

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: 'Trop de tentatives. Réessayez dans quelques minutes.',
});

const submitSchema = z.object({
  orderNumber: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  reference: z
    .string()
    .trim()
    .min(4, 'Référence de transaction trop courte')
    .max(60, 'Référence de transaction trop longue')
    .regex(/^[A-Za-z0-9._\-/ ]+$/, 'Référence invalide'),
  payerPhone: z.string().trim().min(6, 'Numéro Mobile Money requis').max(30),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Motif requis').max(300),
});

function aggregateStatus(orders: Order[]): PaymentStatus {
  const active = orders.filter((o) => o.status !== 'cancelled');
  if (active.length === 0) return 'awaiting';
  if (active.every((o) => o.paymentStatus === 'paid')) return 'paid';
  if (active.some((o) => o.paymentStatus === 'rejected')) return 'rejected';
  if (active.some((o) => o.paymentStatus === 'submitted')) return 'submitted';
  return 'awaiting';
}

function summarize(orders: GroupOrder[]) {
  const active = orders.filter((o) => o.status !== 'cancelled');
  const reference = orders.find((o) => o.paymentReference) ?? orders[0];
  const method = getPaymentMethod(orders[0].paymentMethod);
  const operator = getAutomaticOperator(orders[0].paymentMethod);
  const instant = operator && aggregateStatus(orders) !== 'paid' && active.length > 0 ? operator : null;
  // Date limite : la plus proche parmi les commandes encore à payer (null si payé, à vérifier ou désactivé)
  const deadlines = orders.flatMap((o) => { const d = orderExpiresAt(o); return d ? [d.getTime()] : []; });
  return {
    paymentStatus: aggregateStatus(orders),
    // Paiement instantané par l'API de l'opérateur proposé (opérateur du panier configuré et panier encore à payer)
    automatic: instant !== null,
    // Paiement de démonstration (opérateurs simulés, aucun argent réel) : l'interface l'annonce
    demo: isDemoPayments(),
    // Comment se déroule ce paiement instantané : demande sur le téléphone (push) ou page de l'opérateur (redirect)
    instant: instant && {
      provider: instant.id,
      label: instant.label,
      kind: instant.kind,
      flow: instant.flow,
      phonePrefixes: instant.phonePrefixes,
      phonePlaceholder: instant.phonePlaceholder,
    },
    expiresAt: deadlines.length > 0 ? new Date(Math.min(...deadlines)) : null,
    // Motif d'annulation (ex. « Non payée dans le délai imparti ») quand toutes les commandes sont annulées
    cancelReason: active.length === 0 ? orders.find((o) => o.cancelReason)?.cancelReason ?? null : null,
    method: orders[0].paymentMethod,
    methodLabel: paymentMethodLabel(orders[0].paymentMethod),
    // Paiement manuel par référence possible (Mobile Money) ; la carte bancaire et PayPal se paient en ligne uniquement
    manual: acceptsManualPayment(orders[0].paymentMethod),
    // Numéro marchand toujours issu de la configuration courante
    number: method?.number ?? null,
    accountName: method?.accountName ?? null,
    totalAmount: active.reduce((sum, o) => sum + o.total, 0),
    reference: reference.paymentReference,
    payerPhone: reference.paymentPayerPhone,
    submittedAt: reference.paymentSubmittedAt,
    paidAt: orders.find((o) => o.paidAt)?.paidAt ?? null,
    rejectionReason: orders.find((o) => o.paymentRejectionReason)?.paymentRejectionReason ?? null,
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      sellerName: o.seller?.name ?? null,
      total: o.total,
      status: o.status,
      paymentStatus: o.paymentStatus,
    })),
  };
}

// Moyens de paiement proposés (numéros marchands)
router.get('/methods', (_req: Request, res: Response) => {
  res.json({ methods: getPaymentMethods() });
});

// État du paiement d'une commande (et des commandes de son panier)
router.get('/status', optionalAuthenticate, paymentLimiter, async (req: Request, res: Response) => {
  try {
    const orderNumber = typeof req.query.orderNumber === 'string' ? req.query.orderNumber.trim() : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : undefined;
    if (!orderNumber) return res.status(400).json({ error: 'Numéro de commande requis' });

    const orders = await loadGroup(orderNumber);
    // Même réponse pour « introuvable » et « pas la vôtre »
    if (!orders || !canAccess(req, orders[0], email)) {
      return res.status(404).json({ error: 'Aucune commande ne correspond à ces informations' });
    }
    let group = orders;
    let attempt = await prisma.paymentAttempt.findFirst({
      where: { orderId: { in: orders.map((o) => o.id) } },
      orderBy: { createdAt: 'desc' },
    });
    if (attempt?.status === 'pending') {
      const fresh = await reconcileAttempt(attempt.id);
      if (fresh && fresh.status !== 'pending') {
        attempt = fresh;
        group = (await loadGroup(orderNumber)) ?? orders; // la vérification a pu régler les commandes
      }
    }
    res.json({
      ...summarize(group),
      attempt: attempt
        ? (({ id, provider, status, failureReason, payerPhone, paymentUrl, createdAt }) => ({
            id,
            provider,
            status,
            failureReason,
            payerPhone,
            // Page de paiement du prestataire (Orange Money, Stripe, PayPal) : seulement tant que la demande est en cours
            paymentUrl: status === 'pending' ? paymentUrl : null,
            createdAt,
          }))(presentedAttempt(attempt, group))
        : null,
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});

// Le client transmet la référence de sa transaction Mobile Money
router.post('/submit', optionalAuthenticate, paymentLimiter, async (req: Request, res: Response) => {
  try {
    const data = submitSchema.parse(req.body);

    const orders = await loadGroup(data.orderNumber);
    if (!orders || !canAccess(req, orders[0], data.email)) {
      return res.status(404).json({ success: false, error: 'Aucune commande ne correspond à ces informations' });
    }

    if (!acceptsManualPayment(orders[0].paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: `Le paiement par ${orders[0].paymentMethod === 'stripe' ? 'carte bancaire' : paymentMethodLabel(orders[0].paymentMethod)} se fait uniquement en ligne`,
      });
    }

    const active = orders.filter((o) => o.status !== 'cancelled');
    if (active.length === 0) {
      return res.status(400).json({ success: false, error: 'Cette commande est annulée' });
    }
    if (active.every((o) => o.paymentStatus === 'paid')) {
      return res.status(409).json({ success: false, error: 'Cette commande est déjà payée' });
    }
    // Une demande de paiement automatique est en cours : une référence manuelle l'écraserait et brouillerait la vérification
    const inProgress = await prisma.paymentAttempt.findFirst({
      where: { orderId: { in: orders.map((o) => o.id) }, status: 'pending' },
      select: { id: true, provider: true },
    });
    if (inProgress) {
      return res.status(409).json({
        success: false,
        error:
          getOperator(inProgress.provider)?.flow === 'redirect'
            ? `Un paiement ${getOperator(inProgress.provider)?.label} est en cours : terminez-le sur la page de l’opérateur (ou attendez son expiration) avant d’envoyer une référence.`
            : `Un paiement ${getOperator(inProgress.provider)?.label ?? 'Mobile Money'} est en cours : confirmez-le sur votre téléphone (ou attendez son expiration) avant d’envoyer une référence.`,
      });
    }

    // Une même transaction ne peut pas justifier deux paniers différents
    const groupIds = orders.map((o) => o.id);
    const reused = await prisma.order.findFirst({
      where: {
        paymentReference: { equals: data.reference, mode: 'insensitive' },
        paymentStatus: { in: ['submitted', 'paid'] },
        id: { notIn: groupIds },
      },
      select: { id: true },
    });
    if (reused) {
      return res.status(409).json({
        success: false,
        error: 'Cette référence de transaction est déjà utilisée pour une autre commande',
      });
    }

    await prisma.order.updateMany({
      where: { id: { in: active.filter((o) => o.paymentStatus !== 'paid').map((o) => o.id) } },
      data: {
        paymentStatus: 'submitted',
        paymentReference: data.reference,
        paymentPayerPhone: data.payerPhone,
        paymentSubmittedAt: new Date(),
        paymentRejectionReason: null,
      },
    });

    res.json({
      success: true,
      message: 'Référence reçue. Votre paiement va être vérifié.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: error.errors[0]?.message ?? 'Données invalides',
        details: error.errors,
      });
    }
    console.error('Error submitting payment:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l’enregistrement du paiement' });
  }
});

// Admin : paiements à vérifier (par défaut) ou filtrés par statut, regroupés par panier
router.get('/admin', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const filter = typeof req.query.status === 'string' ? req.query.status : 'submitted';
    const statusWhere =
      filter === 'all'
        ? {}
        : { paymentStatus: (['awaiting', 'submitted', 'paid', 'rejected'].includes(filter) ? filter : 'submitted') as PaymentStatus };

    const orders = await prisma.order.findMany({
      where: { ...statusWhere, ...(filter === 'paid' ? {} : { status: { not: 'cancelled' } }) },
      include: {
        seller: { select: { name: true } },
        company: { select: { name: true, contactEmail: true, contactPhone: true } },
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, typeof orders>();
    for (const order of orders) {
      const key = order.checkoutGroup ?? order.id;
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }

    const attempts =
      (await prisma.paymentAttempt.findMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
        orderBy: { createdAt: 'desc' },
      })) ?? [];

    res.json({
      payments: [...groups.values()].map((group) => {
        const first = group[0];
        const ids = new Set(group.map((o) => o.id));
        const attempt = attempts.find((a) => ids.has(a.orderId));
        return {
          id: first.id,
          buyer: buyerOf(first),
          ...summarize(group),
          // Paiement lancé par l'API d'un opérateur (et non par une référence saisie à la main)
          automatic: group.some((o) => isApiReference(o.paymentReference)),
          attempt: attempt ? { status: attempt.status, failureReason: attempt.failureReason } : null,
          // Total de ce qui est affiché dans le groupe (les commandes filtrées uniquement)
          totalAmount: group.reduce((sum, o) => sum + o.total, 0),
          createdAt: first.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

async function loadGroupForAdmin(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  return prisma.order.findMany({
    where: order.checkoutGroup ? { checkoutGroup: order.checkoutGroup } : { id: order.id },
    include: {
      company: { select: { name: true, contactEmail: true, contactPhone: true } },
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  });
}

// Admin : lance tout de suite l'annulation des commandes non payées dont le délai est dépassé
// (elle tourne aussi automatiquement toutes les 10 minutes)
router.post('/admin/expire-unpaid', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await expireUnpaidOrders()) });
  } catch (error) {
    console.error('Error expiring unpaid orders:', error);
    res.status(500).json({ error: 'Failed to expire unpaid orders' });
  }
});

// Admin : le paiement est arrivé -> les commandes du panier passent en traitement
router.patch('/admin/:orderId/confirm', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const orders = await loadGroupForAdmin(req.params.orderId);
    if (!orders) return res.status(404).json({ error: 'Commande non trouvée' });

    const toConfirm = orders.filter((o) => o.status !== 'cancelled' && o.paymentStatus !== 'paid');
    if (toConfirm.length === 0) {
      return res.status(409).json({ error: 'Aucun paiement à confirmer pour cette commande' });
    }

    // Règlement partagé avec la confirmation automatique (commission, démarrage de la commande, e-mail)
    await markOrdersPaid({ orders: toConfirm, buyerOrder: orders[0] });

    res.json({ success: true, confirmed: toConfirm.length });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Admin : paiement introuvable/incorrect -> le client peut saisir une nouvelle référence
router.patch('/admin/:orderId/reject', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = rejectSchema.parse(req.body);

    const orders = await loadGroupForAdmin(req.params.orderId);
    if (!orders) return res.status(404).json({ error: 'Commande non trouvée' });

    const toReject = orders.filter((o) => o.status !== 'cancelled' && o.paymentStatus !== 'paid');
    if (toReject.length === 0) {
      return res.status(409).json({ error: 'Aucun paiement à refuser pour cette commande' });
    }

    await prisma.order.updateMany({
      where: { id: { in: toReject.map((o) => o.id) } },
      data: { paymentStatus: 'rejected', paymentRejectionReason: reason },
    });

    const buyer = buyerOf(orders[0]);
    if (buyer.email) {
      sendPaymentRejectedEmail({
        orderNumbers: toReject.map((o) => o.orderNumber),
        companyName: buyer.name,
        contactEmail: buyer.email,
        totalAmount: toReject.reduce((sum, o) => sum + o.total, 0),
        reason,
      }).catch((err) => console.error('Failed to send payment rejection email:', err));
    }

    res.json({ success: true, rejected: toReject.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message ?? 'Motif requis' });
    }
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

export default router;
