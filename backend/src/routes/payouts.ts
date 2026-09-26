import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireApprovedCompany, requirePlatformAdmin } from '../middleware/auth.js';
import {
  MAX_COMMISSION_RATE,
  defaultCommissionRate,
  effectiveCommissionRate,
  isValidCommissionRate,
  payoutEligibleWhere,
} from '../lib/commission.js';
import { sendPayoutPaidEmail } from '../services/emailService.js';

const router = Router();

// Commissions et reversements aux vendeurs.
//  - Admin : vue d'ensemble par vendeur, enregistrement d'un reversement, historique, taux par vendeur.
//  - Vendeur : ses gains, ce qui lui est dû, l'historique des reversements, ses coordonnées de versement.
// L'argent est envoyé HORS du site (Mobile Money / virement) ; le site enregistre le reversement avec sa
// référence et verrouille les commandes concernées pour qu'elles ne soient jamais payées deux fois.

const PAYOUT_METHODS = ['mvola', 'orange_money', 'airtel_money', 'bank_transfer'] as const;
const PAYOUT_METHOD_LABELS: Record<(typeof PAYOUT_METHODS)[number], string> = {
  mvola: 'MVola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  bank_transfer: 'virement bancaire',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const createPayoutSchema = z.object({
  method: z.enum(PAYOUT_METHODS),
  reference: z.string().trim().min(3, 'Référence de la transaction requise').max(80),
  note: z.string().trim().max(300).optional(),
  // Sans orderIds : toutes les commandes éligibles du vendeur
  orderIds: z.array(z.string()).min(1).max(500).optional(),
});

const commissionSchema = z.object({
  rate: z
    .number()
    .min(0, 'Le taux doit être entre 0 et ' + MAX_COMMISSION_RATE)
    .max(MAX_COMMISSION_RATE, 'Le taux doit être entre 0 et ' + MAX_COMMISSION_RATE)
    .nullable(),
});

const payoutDetailsSchema = z.object({
  method: z.enum(PAYOUT_METHODS),
  number: z
    .string()
    .trim()
    .min(6, 'Numéro ou IBAN trop court')
    .max(40)
    .regex(/^[0-9A-Za-z +().\-]+$/, 'Caractères non autorisés'),
  accountName: z.string().trim().max(100).optional(),
});

const sum = (values: (number | null | undefined)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

function zodMessage(error: z.ZodError): string {
  return error.errors[0]?.message ?? 'Données invalides';
}

// ---------------------------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------------------------

// Vue d'ensemble : pour chaque vendeur, ce qui est à reverser, en cours, déjà versé
router.get('/admin/summary', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        sellerId: { not: null },
        paymentStatus: 'paid',
        status: { not: 'cancelled' },
        sellerAmount: { not: null },
      },
      select: { sellerId: true, status: true, payoutId: true, commissionAmount: true, sellerAmount: true },
    });
    const payouts = await prisma.payout.findMany({ select: { sellerId: true, amount: true, ordersCount: true } });

    const sellerIds = new Set<string>([
      ...orders.flatMap((o) => (o.sellerId ? [o.sellerId] : [])),
      ...payouts.map((p) => p.sellerId),
    ]);
    const companies = await prisma.company.findMany({
      where: { OR: [{ id: { in: [...sellerIds] } }, { products: { some: {} } }] },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        commissionRate: true,
        payoutMethod: true,
        payoutNumber: true,
        payoutAccountName: true,
      },
      orderBy: { name: 'asc' },
    });

    const sellers = companies.map((company) => {
      const mine = orders.filter((o) => o.sellerId === company.id);
      const unpaid = mine.filter((o) => !o.payoutId);
      const eligible = unpaid.filter((o) => o.status === 'delivered');
      const pending = unpaid.filter((o) => o.status !== 'delivered');
      const myPayouts = payouts.filter((p) => p.sellerId === company.id);
      return {
        id: company.id,
        name: company.name,
        contactEmail: company.contactEmail,
        commissionRate: company.commissionRate,
        effectiveRate: effectiveCommissionRate(company),
        payout: {
          method: company.payoutMethod,
          number: company.payoutNumber,
          accountName: company.payoutAccountName,
        },
        eligible: { count: eligible.length, amount: sum(eligible.map((o) => o.sellerAmount)), commission: sum(eligible.map((o) => o.commissionAmount)) },
        pending: { count: pending.length, amount: sum(pending.map((o) => o.sellerAmount)) },
        paidOut: { count: sum(myPayouts.map((p) => p.ordersCount)), amount: sum(myPayouts.map((p) => p.amount)) },
        commissionEarned: sum(mine.map((o) => o.commissionAmount)),
      };
    });

    res.json({
      defaultRate: defaultCommissionRate(),
      maxRate: MAX_COMMISSION_RATE,
      totals: {
        toPayOut: sum(sellers.map((s) => s.eligible.amount)),
        pending: sum(sellers.map((s) => s.pending.amount)),
        paidOut: sum(sellers.map((s) => s.paidOut.amount)),
        // Commissions sur toutes les ventes payées (revenu de la plateforme)
        commissionEarned: sum(sellers.map((s) => s.commissionEarned)),
      },
      sellers,
    });
  } catch (error) {
    console.error('Error fetching payout summary:', error);
    res.status(500).json({ error: 'Failed to fetch payout summary' });
  }
});

// Commandes d'un vendeur prêtes à être reversées (payées et livrées)
router.get('/admin/sellers/:sellerId/eligible', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: payoutEligibleWhere(req.params.sellerId),
      select: {
        id: true,
        orderNumber: true,
        updatedAt: true,
        subtotal: true,
        shippingCost: true,
        total: true,
        commissionRate: true,
        commissionAmount: true,
        sellerAmount: true,
      },
      orderBy: { updatedAt: 'asc' },
    });
    res.json({ orders });
  } catch (error) {
    console.error('Error fetching eligible orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Enregistre un reversement : verrouille les commandes concernées et garde la référence de la transaction
router.post('/admin/sellers/:sellerId/payouts', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const data = createPayoutSchema.parse(req.body);
    const { sellerId } = req.params;

    const seller = await prisma.company.findUnique({
      where: { id: sellerId },
      select: { id: true, name: true, contactEmail: true },
    });
    if (!seller) return res.status(404).json({ error: 'Vendeur introuvable' });

    // Tout ou rien : si une commande a changé entre-temps, rien n'est enregistré
    const result = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { ...payoutEligibleWhere(sellerId), ...(data.orderIds ? { id: { in: data.orderIds } } : {}) },
        select: { id: true, orderNumber: true, commissionAmount: true, sellerAmount: true },
      });
      // Sélection explicite : chaque commande demandée doit être éligible (sinon message précis)
      if (data.orderIds && orders.length !== new Set(data.orderIds).size) {
        throw new HttpError(409, "Certaines commandes ne sont plus éligibles (déjà reversées, annulées ou non livrées). Actualisez la page.");
      }
      if (orders.length === 0) throw new HttpError(400, 'Aucune commande à reverser pour ce vendeur');

      const payout = await tx.payout.create({
        data: {
          sellerId,
          amount: sum(orders.map((o) => o.sellerAmount)),
          commissionTotal: sum(orders.map((o) => o.commissionAmount)),
          ordersCount: orders.length,
          method: data.method,
          reference: data.reference,
          note: data.note || null,
          paidByUserId: req.user!.userId,
        },
      });
      const updated = await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, payoutId: null },
        data: { payoutId: payout.id },
      });
      if (updated.count !== orders.length) {
        throw new HttpError(409, 'Les commandes ont été modifiées pendant l’opération. Réessayez.');
      }
      return { payout, orderNumbers: orders.map((o) => o.orderNumber) };
    });

    sendPayoutPaidEmail({
      companyName: seller.name,
      contactEmail: seller.contactEmail,
      amount: result.payout.amount,
      commissionTotal: result.payout.commissionTotal,
      methodLabel: PAYOUT_METHOD_LABELS[data.method],
      reference: data.reference,
      orderNumbers: result.orderNumbers,
    }).catch((err) => console.error('Failed to send payout email:', err));

    res.status(201).json({ success: true, payout: result.payout, orderNumbers: result.orderNumbers });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodMessage(error) });
    console.error('Error creating payout:', error);
    res.status(500).json({ error: 'Failed to create payout' });
  }
});

// Historique des reversements (tous, ou d'un vendeur)
router.get('/admin/history', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : undefined;
    const payouts = await prisma.payout.findMany({
      where: sellerId ? { sellerId } : {},
      include: {
        seller: { select: { name: true } },
        orders: { select: { orderNumber: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });
    res.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        sellerId: p.sellerId,
        sellerName: p.seller.name,
        amount: p.amount,
        commissionTotal: p.commissionTotal,
        ordersCount: p.ordersCount,
        method: p.method,
        reference: p.reference,
        note: p.note,
        paidAt: p.paidAt,
        orderNumbers: p.orders.map((o) => o.orderNumber),
      })),
    });
  } catch (error) {
    console.error('Error fetching payout history:', error);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

// Taux de commission propre à un vendeur (null = revenir au taux par défaut). Ne change pas l'historique :
// le taux est figé sur chaque commande à la confirmation de son paiement.
router.patch('/admin/sellers/:sellerId/commission', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { rate } = commissionSchema.parse(req.body);
    const seller = await prisma.company.findUnique({ where: { id: req.params.sellerId }, select: { id: true } });
    if (!seller) return res.status(404).json({ error: 'Vendeur introuvable' });

    const updated = await prisma.company.update({
      where: { id: req.params.sellerId },
      data: { commissionRate: rate },
      select: { id: true, commissionRate: true },
    });
    res.json({ success: true, commissionRate: updated.commissionRate, effectiveRate: effectiveCommissionRate(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodMessage(error) });
    console.error('Error updating commission rate:', error);
    res.status(500).json({ error: 'Failed to update commission rate' });
  }
});

// ---------------------------------------------------------------------------------------------
// VENDEUR
// ---------------------------------------------------------------------------------------------

type SellerOrderStatus = 'reversed' | 'to_receive' | 'in_progress';

// Mes gains : ce qui m'a été versé, ce qui m'est dû (commandes livrées), ce qui est en cours
router.get('/seller/summary', authenticate, requireApprovedCompany, async (req: Request, res: Response) => {
  try {
    const companyId = req.user!.companyId!;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { commissionRate: true, payoutMethod: true, payoutNumber: true, payoutAccountName: true },
    });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });

    const orders = await prisma.order.findMany({
      where: { sellerId: companyId, paymentStatus: 'paid', status: { not: 'cancelled' } },
      select: {
        orderNumber: true,
        status: true,
        paidAt: true,
        subtotal: true,
        shippingCost: true,
        total: true,
        commissionRate: true,
        commissionAmount: true,
        sellerAmount: true,
        payoutId: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 300,
    });
    const payouts = await prisma.payout.findMany({
      where: { sellerId: companyId },
      include: { orders: { select: { orderNumber: true } } },
      orderBy: { paidAt: 'desc' },
      take: 100,
    });

    const lines = orders.map((o) => ({
      ...o,
      state: (o.payoutId ? 'reversed' : o.status === 'delivered' ? 'to_receive' : 'in_progress') as SellerOrderStatus,
    }));
    const inState = (state: SellerOrderStatus) => lines.filter((l) => l.state === state);

    res.json({
      defaultRate: defaultCommissionRate(),
      rate: effectiveCommissionRate(company),
      hasCustomRate: company.commissionRate !== null,
      payoutDetails: {
        method: company.payoutMethod,
        number: company.payoutNumber,
        accountName: company.payoutAccountName,
      },
      totals: {
        toReceive: sum(inState('to_receive').map((l) => l.sellerAmount)),
        inProgress: sum(inState('in_progress').map((l) => l.sellerAmount)),
        received: sum(payouts.map((p) => p.amount)),
        commissionPaid: sum(lines.map((l) => l.commissionAmount)),
      },
      orders: lines.map(({ payoutId: _payoutId, ...line }) => line),
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        commissionTotal: p.commissionTotal,
        ordersCount: p.ordersCount,
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
        orderNumbers: p.orders.map((o) => o.orderNumber),
      })),
    });
  } catch (error) {
    console.error('Error fetching seller earnings:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

// Où la plateforme doit me reverser mes gains
router.put('/seller/payout-details', authenticate, requireApprovedCompany, async (req: Request, res: Response) => {
  try {
    const data = payoutDetailsSchema.parse(req.body);
    const updated = await prisma.company.update({
      where: { id: req.user!.companyId! },
      data: { payoutMethod: data.method, payoutNumber: data.number, payoutAccountName: data.accountName || null },
      select: { payoutMethod: true, payoutNumber: true, payoutAccountName: true },
    });
    res.json({
      success: true,
      payoutDetails: { method: updated.payoutMethod, number: updated.payoutNumber, accountName: updated.payoutAccountName },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: zodMessage(error) });
    console.error('Error saving payout details:', error);
    res.status(500).json({ error: 'Failed to save payout details' });
  }
});

export default router;
