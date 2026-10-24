import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { confirmReceiptError, hasOpenDispute, openDisputeError, protectionView } from '../lib/buyerProtection.js';
import { sendValidationError } from '../lib/validation.js';
import { siteUrl } from '../lib/siteUrl.js';
import { buyerOf } from '../services/paymentSettlement.js';
import { sendDisputeOpenedEmail, sendDisputeResolvedEmail } from '../services/emailService.js';
import { sendDisputeResolvedSms } from '../services/smsNotifications.js';

const router = Router();

// Paiement garanti (règles dans lib/buyerProtection.ts) :
//  - acheteur : confirmer la réception (le vendeur peut alors être payé) ou signaler un problème ;
//  - administrateur : liste des litiges, décision (remboursement de l'acheteur ou libération de l'argent).

const BUYER_INCLUDE = {
  company: { select: { name: true, contactEmail: true, contactPhone: true } },
  user: { select: { firstName: true, lastName: true, email: true, phone: true, verifiedPhone: true } },
  seller: { select: { name: true, contactEmail: true } },
} as const;

async function loadBuyerOrder(req: Request) {
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: BUYER_INCLUDE });
  const isBuyer =
    !!order &&
    ((order.userId !== null && order.userId === req.user!.userId) ||
      (order.companyId !== null && order.companyId === req.user!.companyId));
  return isBuyer ? order : null;
}

// L'acheteur confirme avoir bien reçu sa commande
router.post('/:orderId/confirm-receipt', authenticate, async (req: Request, res: Response) => {
  try {
    const order = await loadBuyerOrder(req);
    // Même réponse pour « introuvable » et « pas la vôtre »
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    const error = confirmReceiptError(order);
    if (error) return res.status(409).json({ error });

    const now = new Date();
    // Conditionnelle : un litige ouvert ou une confirmation faite entre-temps l'emporte
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, receivedAt: null, disputeOpenedAt: null },
      data: {
        receivedAt: now,
        receivedBy: 'buyer',
        // Reçue avant que le vendeur l'ait marquée « livrée »
        ...(order.status === 'shipped' ? { status: 'delivered', deliveredAt: now } : {}),
      },
    });
    if (count === 0) return res.status(409).json({ error: 'Cette commande a changé entre-temps : actualisez la page' });

    res.json({ success: true, message: 'Merci ! Réception confirmée.' });
  } catch (error) {
    console.error('Error confirming receipt:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const REASON = 'Décrivez le problème en quelques mots (10 à 1000 caractères)';
const disputeSchema = z.object({ reason: z.string({ message: REASON }).trim().min(10, REASON).max(1000, REASON) });

// L'acheteur signale un problème : le reversement au vendeur est suspendu jusqu'à la décision de l'administrateur
router.post('/:orderId/dispute', authenticate, async (req: Request, res: Response) => {
  try {
    const { reason } = disputeSchema.parse(req.body ?? {});
    const order = await loadBuyerOrder(req);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    const error = openDisputeError(order);
    if (error) return res.status(409).json({ error });

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, receivedAt: null, disputeOpenedAt: null, payoutId: null },
      data: { disputeOpenedAt: new Date(), disputeReason: reason },
    });
    if (count === 0) return res.status(409).json({ error: 'Cette commande a changé entre-temps : actualisez la page' });

    const mail = {
      orderNumber: order.orderNumber,
      buyerName: buyerOf(order).name,
      sellerName: order.seller?.name ?? null,
      total: order.total,
      reason,
    };
    sendDisputeOpenedEmail({ ...mail, manageUrl: `${siteUrl()}/admin/litiges` }).catch((err) =>
      console.error('Failed to send dispute email:', err)
    );
    if (order.seller?.contactEmail) {
      sendDisputeOpenedEmail({ ...mail, contactEmail: order.seller.contactEmail, manageUrl: `${siteUrl()}/vendeur/commandes` }).catch(
        (err) => console.error('Failed to send dispute email to seller:', err)
      );
    }

    res.status(201).json({ success: true, message: 'Problème signalé. Notre équipe revient vers vous rapidement.' });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error opening dispute:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Administration ----------

// Litiges en cours (par défaut) ou tous les litiges (?status=all)
router.get('/admin/disputes', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const all = req.query.status === 'all';
    const orders = await prisma.order.findMany({
      where: { disputeOpenedAt: { not: null }, ...(all ? {} : { disputeResolvedAt: null }) },
      include: { ...BUYER_INCLUDE, items: { include: { product: { select: { name: true } } } } },
      orderBy: { disputeOpenedAt: 'desc' },
      take: 200,
    });

    res.json({
      disputes: orders.map((order) => {
        const buyer = buyerOf(order);
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          buyerPhone: buyer.phone,
          sellerName: order.seller?.name ?? null,
          status: order.status,
          total: order.total,
          paymentMethod: order.paymentMethod,
          disputeOpenedAt: order.disputeOpenedAt,
          disputeResolvedAt: order.disputeResolvedAt,
          items: order.items.map((item) => ({ name: item.product.name, quantity: item.quantity, price: item.price })),
          ...protectionView(order),
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

const resolveSchema = z.object({
  resolution: z.enum(['refund', 'release'], { message: 'Décision invalide' }),
  note: z.string().trim().max(1000, 'Message limité à 1000 caractères').optional(),
});

// Décision : « refund » = l'acheteur est remboursé (hors du site) et la commande annulée, jamais reversée ;
// « release » = la commande est considérée comme reçue et l'argent libéré pour le vendeur
router.patch('/admin/:orderId/dispute', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { resolution, note } = resolveSchema.parse(req.body ?? {});
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: BUYER_INCLUDE });
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (!hasOpenDispute(order)) return res.status(409).json({ error: 'Aucun litige en cours sur cette commande' });

    const now = new Date();
    const decided = { disputeResolvedAt: now, disputeResolution: resolution, disputeNote: note || null };
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, disputeResolvedAt: null, payoutId: null },
      data:
        resolution === 'refund'
          ? { ...decided, status: 'cancelled', cancelReason: 'Litige : acheteur remboursé' }
          : {
              ...decided,
              receivedAt: now,
              receivedBy: 'admin',
              ...(order.status === 'shipped' ? { status: 'delivered', deliveredAt: now } : {}),
            },
    });
    if (count === 0) return res.status(409).json({ error: 'Ce litige a déjà été traité' });

    const buyer = buyerOf(order);
    sendDisputeResolvedSms({ phone: buyer.phone, orderNumber: order.orderNumber, resolution });
    if (buyer.email) {
      sendDisputeResolvedEmail({
        orderNumber: order.orderNumber,
        companyName: buyer.name,
        contactEmail: buyer.email,
        resolution,
        total: order.total,
        note: note || null,
      }).catch((err) => console.error('Failed to send dispute resolution email:', err));
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error resolving dispute:', error);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

export default router;
