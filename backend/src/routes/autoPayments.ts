import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { optionalAuthenticate } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { canAccess, loadGroup } from '../lib/paymentGroup.js';
import { presentedAttempt } from '../lib/attemptPresentation.js';
import { OPERATORS, getOperator } from '../lib/operators.js';
import { requestOrigin } from '../services/demoPayments.js';
import { PaymentHttpError, handleOperatorCallback, initiateAutoPayment, reconcileAttempt } from '../services/mobileMoneyPayments.js';

const router = Router();

// Paiement automatique par l'API d'un prestataire (MVola, Orange Money, Airtel Money, Stripe, PayPal ; voir
// services/mobileMoneyPayments.ts). Le prestataire est celui choisi à la commande.
//   POST /initiate            MVola / Airtel : le client donne son numéro et confirme sur son téléphone ;
//                             Orange Money, Stripe, PayPal : renvoie l'adresse de la page de paiement du prestataire
//   GET  /attempt/:id         le navigateur suit la demande (le serveur interroge l'opérateur à chaque appel)
//   POST /callback/:provider  message de rappel ou webhook du prestataire (jamais cru sur parole : sert seulement de
//                             déclencheur ; seul le statut relu auprès du prestataire compte)

// Chaque demande peut faire sonner un téléphone : limite stricte par adresse IP (et par commande / numéro dans le service)
const initiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de demandes de paiement. Réessayez dans quelques minutes.',
});
const pollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  message: 'Trop de vérifications. Réessayez dans quelques minutes.',
});
const callbackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

const initiateSchema = z.object({
  orderNumber: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  // Obligatoire pour MVola et Airtel Money ; inutile pour les paiements sur la page du prestataire (Orange, Stripe, PayPal)
  payerPhone: z.string().trim().max(30).optional(),
});

function publicAttempt(attempt: {
  id: string;
  provider: string;
  status: string;
  failureReason: string | null;
  payerPhone: string;
  paymentUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: attempt.id,
    provider: attempt.provider,
    status: attempt.status,
    failureReason: attempt.failureReason,
    payerPhone: attempt.payerPhone,
    // Adresse de la page de paiement de l'opérateur, tant que la demande est en cours (opérateurs à redirection)
    paymentUrl: attempt.status === 'pending' ? attempt.paymentUrl : null,
    createdAt: attempt.createdAt,
  };
}

router.post('/initiate', optionalAuthenticate, initiateLimiter, async (req: Request, res: Response) => {
  try {
    const data = initiateSchema.parse(req.body);

    const group = await loadGroup(data.orderNumber);
    // Même réponse pour « introuvable » et « pas la vôtre »
    if (!group || !canAccess(req, group[0], data.email)) {
      return res.status(404).json({ success: false, error: 'Aucune commande ne correspond à ces informations' });
    }
    const anchor = group.find((o) => o.orderNumber === data.orderNumber) ?? group[0];

    const { attempt, reused } = await initiateAutoPayment({ group, anchor, payerPhone: data.payerPhone, siteUrl: requestOrigin(req) });
    const operator = getOperator(attempt.provider);
    res.status(202).json({
      success: true,
      reused,
      attempt: publicAttempt(attempt),
      message:
        operator?.flow === 'redirect'
          ? `Vous allez être redirigé vers ${operator.label} pour payer.`
          : `Demande envoyée : confirmez le paiement sur votre téléphone avec votre code secret ${operator?.label}.`,
    });
  } catch (error) {
    if (error instanceof PaymentHttpError) return res.status(error.status).json({ success: false, error: error.message });
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message ?? 'Données invalides' });
    }
    console.error('Error initiating automatic payment:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la demande de paiement' });
  }
});

router.get('/attempt/:id', optionalAuthenticate, pollLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : undefined;
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: req.params.id } });
    const anchor = attempt ? await prisma.order.findUnique({ where: { id: attempt.orderId } }) : null;
    if (!attempt || !anchor || !canAccess(req, anchor, email)) {
      return res.status(404).json({ error: 'Tentative de paiement introuvable' });
    }
    const fresh = (await reconcileAttempt(attempt.id)) ?? attempt;
    // « completed » seulement une fois les commandes réellement réglées (voir attemptPresentation.ts)
    const group =
      (await prisma.order.findMany({
        where: anchor.checkoutGroup ? { checkoutGroup: anchor.checkoutGroup } : { id: anchor.id },
        select: { status: true, paymentStatus: true },
      })) ?? [];
    res.json(publicAttempt(presentedAttempt(fresh, group)));
  } catch (error) {
    console.error('Error fetching payment attempt:', error);
    res.status(500).json({ error: 'Failed to fetch payment attempt' });
  }
});

// Toujours 200 : l'opérateur n'a pas à savoir si la tentative existe. Le contenu du message n'est jamais cru sur parole.
router.post('/callback/:provider', callbackLimiter, async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;
    if (provider in OPERATORS) await handleOperatorCallback(provider as keyof typeof OPERATORS, req.body);
  } catch (error) {
    console.error('Error handling payment callback:', error);
  }
  res.json({ received: true });
});

export default router;
