import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { DeliveryMethod } from '@prisma/client';
import {
  sendOrderConfirmationEmail,
  sendOrderCancellationEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
} from '../services/emailService.js';
import { invalidateProductCache } from '../lib/cache.js';
import { computeShippingCost } from '../lib/shipping.js';
import { resolveUnitPrice } from '../lib/pricing.js';
import {
  authenticate,
  optionalAuthenticate,
  canOrderOrGuest,
  requirePlatformAdmin,
  requireCanOrder,
  requireApprovedCompany,
} from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { PAYMENT_METHOD_IDS, getPaymentMethod } from '../lib/payments.js';
import { orderExpiresAt } from '../lib/orderExpiry.js';

const router = Router();

const checkoutSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().min(1),
    })
  ).min(1),
  shippingAddress: z
    .object({
      street: z.string(),
      city: z.string(),
      postalCode: z.string(),
      country: z.string().optional(),
    })
    .optional(),
  deliveryMethod: z.enum(['standard', 'express', 'retrait']),
  // Paiement en ligne obligatoire (Mobile Money) : pas de paiement différé ni à la livraison
  paymentMethod: z.enum(PAYMENT_METHOD_IDS),
  notes: z.string().optional(),
  // Commande sans compte : coordonnées du visiteur (obligatoires s'il n'est pas connecté)
  guest: z
    .object({
      name: z.string().trim().min(2, 'Nom requis').max(100),
      email: z.string().trim().email('E-mail invalide').max(200),
      phone: z.string().trim().min(6, 'Téléphone requis').max(30),
    })
    .optional(),
  // Champ piège pour les robots : un humain ne le voit pas et le laisse vide
  website: z.string().optional(),
});

// Commandes sans compte : limitées par IP pour freiner les abus (les visiteurs connectés ne le sont pas)
const guestOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Trop de commandes depuis cette adresse. Réessayez plus tard.',
});
const limitGuestOrders = (req: Request, res: Response, next: NextFunction) =>
  req.user ? next() : guestOrderLimiter(req, res, next);

// Suivi d'une commande passée sans compte (numéro + e-mail), limité pour empêcher l'énumération
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Trop de recherches. Réessayez dans quelques minutes.',
});

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `ORD-${timestamp}-${randomStr}`.toUpperCase();
}

// Passer commande — particuliers et visiteurs (prix de base) ou entreprises approuvées (prix
// dégressifs). Le paiement Mobile Money est obligatoire pour tous : la commande reste « en attente »
// jusqu'à confirmation du paiement par un administrateur. Le MOQ s'applique à tous : vente en gros.
// Le prix n'est JAMAIS pris depuis le client : il est recalculé serveur.
router.post('/', optionalAuthenticate, limitGuestOrders, canOrderOrGuest, async (req: Request, res: Response) => {
  try {
    const validatedData = checkoutSchema.parse(req.body);

    if (validatedData.deliveryMethod !== 'retrait' && !validatedData.shippingAddress) {
      return res.status(400).json({ success: false, error: 'Adresse de livraison requise' });
    }

    // Visiteur sans compte : traité comme un particulier (prix de base)
    const isGuest = !req.user;
    if (validatedData.website) {
      return res.status(400).json({ success: false, error: 'Demande refusée' });
    }
    if (isGuest && !validatedData.guest) {
      return res
        .status(400)
        .json({ success: false, error: 'Vos coordonnées sont requises pour commander sans compte' });
    }
    const guest = validatedData.guest;
    const isCustomer = isGuest || req.user!.role === 'customer';

    const company = isCustomer
      ? null
      : await prisma.company.findUnique({ where: { id: req.user!.companyId! } });
    if (!isCustomer && !company) {
      return res.status(404).json({ success: false, error: 'Entreprise introuvable' });
    }

    const customerUser =
      isCustomer && !isGuest
        ? await prisma.user.findUnique({ where: { id: req.user!.userId } })
        : null;
    if (isCustomer && !isGuest && !customerUser) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const paymentMethod = getPaymentMethod(validatedData.paymentMethod);
    if (!paymentMethod) {
      return res.status(400).json({ success: false, error: "Ce moyen de paiement n'est pas disponible" });
    }

    const productIds = validatedData.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        priceTiers: true,
        seller: { select: { id: true, name: true, status: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Vérifie l'existence des produits et le respect du MOQ avant tout calcul
    for (const item of validatedData.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, error: `Produit ${item.productId} introuvable` });
      }
      // Seuls les produits publiés (validés, actifs, vendeur approuvé) peuvent être commandés
      const unavailable =
        (product.status && product.status !== 'approved') ||
        product.isActive === false ||
        (product.seller && product.seller.status !== 'approved');
      if (unavailable) {
        return res.status(400).json({
          success: false,
          error: `"${product.name}" n'est plus disponible à la vente`,
        });
      }
      if (company && product.sellerId && product.sellerId === company.id) {
        return res.status(400).json({
          success: false,
          error: `Vous ne pouvez pas acheter votre propre produit "${product.name}"`,
        });
      }
      if (item.quantity < product.moq) {
        return res.status(400).json({
          success: false,
          error: `Quantité minimum pour "${product.name}" : ${product.moq} ${product.unit}(s)`,
        });
      }
    }

    // Prix serveur, résolu depuis les paliers de prix
    const pricedItems = validatedData.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const price = isCustomer
        ? product.price
        : resolveUnitPrice(product.price, product.priceTiers, item.quantity);
      return { productId: item.productId, quantity: item.quantity, price, product };
    });

    // Adresse (liée à l'entreprise ou au particulier) si fournie : une seule pour tout le panier
    let address = null;
    if (validatedData.shippingAddress) {
      address = await prisma.address.create({
        data: {
          ...(company ? { companyId: company.id } : isGuest ? {} : { userId: req.user!.userId }),
          street: validatedData.shippingAddress.street,
          city: validatedData.shippingAddress.city,
          postalCode: validatedData.shippingAddress.postalCode,
          country: validatedData.shippingAddress.country || 'Madagascar',
        },
      });
    }

    // Un panier multi-vendeurs est scindé en une commande par vendeur (sellerId null = plateforme).
    // Frais de livraison, stock et e-mails sont traités séparément pour chaque commande.
    const groups = new Map<string | null, typeof pricedItems>();
    for (const item of pricedItems) {
      const key = item.product.sellerId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const checkoutGroup = randomUUID();
    const createdOrders: {
      id: string;
      orderNumber: string;
      status: string;
      total: number;
      sellerName: string | null;
    }[] = [];
    const emailDatas: Parameters<typeof sendOrderConfirmationEmail>[0][] = [];

    for (const [sellerId, groupItems] of groups) {
      const subtotal = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const freeShippingProductIds = new Set(
        groupItems.filter((item) => item.product.freeShipping).map((item) => item.productId)
      );
      const shippingCost = computeShippingCost(
        validatedData.deliveryMethod,
        subtotal,
        freeShippingProductIds,
        groupItems,
      );
      const total = subtotal + shippingCost;

      let allInStock = true;
      const stockUpdates: { id: string; newQuantity: number }[] = [];

      for (const item of groupItems) {
        if (item.product.stockQuantity < item.quantity) {
          allInStock = false;
          break;
        }
        stockUpdates.push({
          id: item.productId,
          newQuantity: item.product.stockQuantity - item.quantity,
        });
      }

      // Toute commande démarre « en attente » : elle n'avance qu'après confirmation du paiement.
      // Le stock est réservé dès maintenant s'il suffit (restitué en cas d'annulation).
      const orderStatus = 'pending';

      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          companyId: company?.id ?? null,
          userId: req.user?.userId ?? null,
          guestName: guest?.name ?? null,
          guestEmail: guest?.email.toLowerCase() ?? null,
          guestPhone: guest?.phone ?? null,
          sellerId,
          checkoutGroup,
          addressId: address?.id,
          deliveryMethod: validatedData.deliveryMethod as DeliveryMethod,
          status: orderStatus,
          subtotal,
          shippingCost,
          total,
          paymentMethod: paymentMethod.id,
          paymentStatus: 'awaiting',
          stockReserved: allInStock,
          notes: validatedData.notes,
          items: {
            create: groupItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              availableFrom: item.product.availableFrom ?? null,
            })),
          },
        },
        include: { items: true },
      });

      if (allInStock) {
        await Promise.all(
          stockUpdates.map((update) =>
            prisma.product.update({
              where: { id: update.id },
              data: {
                stockQuantity: update.newQuantity,
                inStock: update.newQuantity > 0,
              },
            })
          )
        );
        await invalidateProductCache();
      }

      const emailData = {
        orderNumber: order.orderNumber,
        companyName: company
          ? company.name
          : guest
            ? guest.name
            : `${customerUser!.firstName} ${customerUser!.lastName}`,
        contactEmail: company ? company.contactEmail : guest ? guest.email : customerUser!.email,
        contactPhone: (company ? company.contactPhone : guest ? guest.phone : customerUser!.phone) ?? undefined,
        address: address
          ? {
              street: address.street,
              city: address.city,
              postalCode: address.postalCode,
              country: address.country,
            }
          : null,
        deliveryMethod: validatedData.deliveryMethod,
        items: groupItems.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          availableFrom: item.product.availableFrom ?? null,
        })),
        subtotal,
        shippingCost,
        total,
        status: orderStatus,
        createdAt: new Date(),
      };
      emailDatas.push(emailData);

      createdOrders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        status: orderStatus,
        total,
        sellerName: groupItems[0].product.seller?.name ?? null,
      });
    }

    const totalAmount = createdOrders.reduce((sum, o) => sum + o.total, 0);
    // Date limite de paiement (null si l'annulation automatique est désactivée)
    const placedAt = new Date();
    const expiresAt = orderExpiresAt({ status: 'pending', paymentStatus: 'awaiting', createdAt: placedAt, updatedAt: placedAt });
    const payment = {
      method: paymentMethod.id,
      label: paymentMethod.label,
      number: paymentMethod.number,
      accountName: paymentMethod.accountName,
      totalAmount,
      expiresAt,
    };

    // Envoi asynchrone (ne bloque pas la réponse) : e-mail avec les instructions de paiement
    for (const emailData of emailDatas) {
      sendOrderConfirmationEmail({
        ...emailData,
        payment: {
          methodLabel: paymentMethod.label,
          number: paymentMethod.number,
          accountName: paymentMethod.accountName,
          totalToPay: totalAmount,
          expiresAt,
        },
      }).catch((err) => console.error('Failed to send email:', err));
    }

    const first = createdOrders[0];

    res.json({
      success: true,
      message: 'Commande enregistrée : en attente de votre paiement',
      // Champs de la première commande conservés (compatibilité) ; `orders` liste toutes les commandes
      orderId: first.id,
      orderNumber: first.orderNumber,
      status: first.status,
      total: totalAmount,
      payment,
      orders: createdOrders,
    });
  } catch (error) {
    console.error('Checkout error:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la commande',
    });
  }
});

// Admin: Get all orders (MUST be before /:orderNumber)
router.get('/orders', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        company: true,
        user: true,
        customer: true,
        seller: { select: { name: true } },
        address: true,
        items: {
          include: {
            product: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      sellerName: order.seller?.name ?? null,
      companyName: order.company?.name ?? (order.user ? `${order.user.firstName} ${order.user.lastName}` : order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : order.guestName ?? 'N/A'),
      customerType: order.companyId ? 'professionnel' : 'particulier',
      isGuest: !order.companyId && !order.userId && !order.customerId,
      contactEmail: order.company?.contactEmail ?? order.user?.email ?? order.customer?.email ?? order.guestEmail ?? null,
      contactPhone: order.company?.contactPhone ?? order.user?.phone ?? order.customer?.phone ?? order.guestPhone ?? null,
      status: order.status,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentReference: order.paymentReference,
      paymentRejectionReason: order.paymentRejectionReason,
      paidAt: order.paidAt,
      notes: order.notes,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      address: order.address
        ? {
            street: order.address.street,
            city: order.address.city,
            postalCode: order.address.postalCode,
            country: order.address.country,
          }
        : null,
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
        availableFrom: item.availableFrom,
      })),
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Client (entreprise ou particulier) : ses propres commandes
router.get('/orders/mine', authenticate, requireCanOrder, async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: req.user!.role === 'customer'
        ? { userId: req.user!.userId }
        : { companyId: req.user!.companyId! },
      include: {
        seller: { select: { name: true } },
        address: true,
        items: {
          include: { product: { select: { name: true, slug: true, images: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      sellerName: order.seller?.name ?? null,
      checkoutGroup: order.checkoutGroup,
      status: order.status,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentReference: order.paymentReference,
      paymentRejectionReason: order.paymentRejectionReason,
      paidAt: order.paidAt,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      address: order.address
        ? {
            street: order.address.street,
            city: order.address.city,
            postalCode: order.address.postalCode,
            country: order.address.country,
          }
        : null,
      items: order.items.map((item) => ({
        name: item.product.name,
        slug: item.product.slug,
        image: item.product.images[0] ?? null,
        quantity: item.quantity,
        price: item.price,
        availableFrom: item.availableFrom,
      })),
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('Error fetching company orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Vendeur (entreprise approuvée) : commandes reçues pour ses produits
router.get('/orders/seller', authenticate, requireApprovedCompany, async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { sellerId: req.user!.companyId! },
      include: {
        company: true,
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        address: true,
        items: { include: { product: { select: { name: true, slug: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        buyerName:
          order.company?.name ??
          (order.user ? `${order.user.firstName} ${order.user.lastName}` : order.guestName ?? 'N/A'),
        buyerType: order.companyId ? 'professionnel' : 'particulier',
        contactEmail: order.company?.contactEmail ?? order.user?.email ?? order.guestEmail ?? null,
        contactPhone: order.company?.contactPhone ?? order.user?.phone ?? order.guestPhone ?? null,
        status: order.status,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
        deliveryMethod: order.deliveryMethod,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        // Part du vendeur (calculée à la confirmation du paiement) ; reversed = déjà versée par la plateforme
        commissionRate: order.commissionRate,
        commissionAmount: order.commissionAmount,
        sellerAmount: order.sellerAmount,
        reversed: !!order.payoutId,
        notes: order.notes,
        cancelReason: order.cancelReason,
        createdAt: order.createdAt,
        address: order.address
          ? {
              street: order.address.street,
              city: order.address.city,
              postalCode: order.address.postalCode,
              country: order.address.country,
            }
          : null,
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          availableFrom: item.availableFrom,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Admin ou vendeur propriétaire de la commande : changer son statut
router.patch('/orders/:orderId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    const isAdmin = req.user!.role === 'platform_admin';
    const isOrderSeller = !!req.user!.companyId && existingOrder?.sellerId === req.user!.companyId;
    if (!isAdmin && !isOrderSeller) {
      // Même réponse pour « introuvable » et « pas la vôtre » : on ne révèle pas l'existence de la commande
      return res.status(403).json({ error: 'Accès réservé aux administrateurs ou au vendeur de la commande' });
    }

    if (!existingOrder) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    if (existingOrder.status === 'cancelled') {
      return res.status(400).json({ error: 'Cette commande est déjà annulée' });
    }

    // Le produit de cette commande a déjà été reversé au vendeur : l'annuler fausserait les comptes
    if (status === 'cancelled' && existingOrder.payoutId) {
      return res.status(400).json({ error: 'Cette commande a déjà été reversée au vendeur : annulation impossible' });
    }

    // La commande n'avance qu'une fois le paiement Mobile Money confirmé
    const requiresPayment = ['confirmed', 'processing', 'shipped', 'delivered'].includes(status);
    if (requiresPayment && existingOrder.paymentStatus !== 'paid') {
      return res.status(400).json({ error: "Le paiement de cette commande n'a pas encore été confirmé" });
    }

    // Commande payée mais dont le stock n'avait pas pu être réservé : on le réserve maintenant
    const mustReserveStock = requiresPayment && !existingOrder.stockReserved;
    if (mustReserveStock) {
      const stocks = await prisma.product.findMany({
        where: { id: { in: existingOrder.items.map((i) => i.productId) } },
        select: { id: true, name: true, stockQuantity: true },
      });
      const stockById = new Map(stocks.map((p) => [p.id, p]));
      for (const item of existingOrder.items) {
        const product = stockById.get(item.productId);
        if (!product || product.stockQuantity < item.quantity) {
          return res.status(400).json({
            error: `Stock insuffisant pour "${product?.name ?? item.productId}"`,
          });
        }
      }
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === 'cancelled' ? { cancelReason: reason || null, stockReserved: false } : {}),
        ...(mustReserveStock ? { stockReserved: true } : {}),
      },
      include: {
        company: true,
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        customer: true,
        address: true,
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    // Stock : réservé à la création si suffisant (stockReserved) et restitué en cas d'annulation ;
    // une commande payée dont le stock n'était pas réservé le décrémente à son premier avancement.
    if (mustReserveStock) {
      await Promise.all(
        existingOrder.items.map((item) =>
          prisma.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { decrement: item.quantity } },
          })
        )
      );
      await invalidateProductCache();
    }
    if (status === 'cancelled' && existingOrder.stockReserved) {
      await Promise.all(
        existingOrder.items.map((item) =>
          prisma.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { increment: item.quantity },
              inStock: true,
            },
          })
        )
      );
      await invalidateProductCache();
    }

    const companyName = order.company?.name ?? (order.user ? `${order.user.firstName} ${order.user.lastName}` : order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : order.guestName ?? 'N/A');
    const contactEmail = order.company?.contactEmail ?? order.user?.email ?? order.customer?.email ?? order.guestEmail ?? null;

    // Envoi asynchrone des emails de notification (ne bloque pas la réponse)
    if (status === 'cancelled' && contactEmail) {
      sendOrderCancellationEmail({
        orderNumber: order.orderNumber,
        companyName,
        contactEmail,
        reason: reason || undefined,
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          availableFrom: item.availableFrom,
        })),
        total: order.total,
        cancelledAt: new Date(),
      }).catch((err) => console.error('Failed to send cancellation email:', err));
    } else if ((status === 'shipped' || status === 'delivered') && contactEmail) {
      const emailData = {
        orderNumber: order.orderNumber,
        companyName,
        contactEmail,
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          availableFrom: item.availableFrom,
        })),
        total: order.total,
        deliveryMethod: order.deliveryMethod,
        address: order.address
          ? {
              street: order.address.street,
              city: order.address.city,
              postalCode: order.address.postalCode,
              country: order.address.country,
            }
          : null,
        updatedAt: new Date(),
      };

      const sendFn = status === 'shipped' ? sendOrderShippedEmail : sendOrderDeliveredEmail;
      sendFn(emailData).catch((err) =>
        console.error(`Failed to send ${status} email:`, err)
      );
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Suivi d'une commande passée sans compte : numéro + e-mail saisi à la commande.
// Même réponse 404 si le numéro n'existe pas ou si l'e-mail ne correspond pas.
router.get('/track', trackLimiter, async (req: Request, res: Response) => {
  try {
    const orderNumber = typeof req.query.orderNumber === 'string' ? req.query.orderNumber.trim() : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!orderNumber || !email) {
      return res.status(400).json({ error: 'Numéro de commande et e-mail requis' });
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        seller: { select: { name: true } },
        address: true,
        items: { include: { product: { select: { name: true, slug: true } } } },
      },
    });

    if (!order || !order.guestEmail || order.guestEmail.toLowerCase() !== email) {
      return res.status(404).json({ error: 'Aucune commande ne correspond à ces informations' });
    }

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentRejectionReason: order.paymentRejectionReason,
      sellerName: order.seller?.name ?? null,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      address: order.address
        ? {
            street: order.address.street,
            city: order.address.city,
            postalCode: order.address.postalCode,
            country: order.address.country,
          }
        : null,
      items: order.items.map((item) => ({ name: item.product.name, quantity: item.quantity, price: item.price })),
    });
  } catch (error) {
    console.error('Error tracking guest order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Get order by number — accessible par l'entreprise propriétaire ou un admin plateforme
router.get('/:orderNumber', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        company: true,
        customer: true,
        address: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const isOwner =
      (order.companyId && order.companyId === req.user!.companyId) ||
      (order.sellerId && order.sellerId === req.user!.companyId) ||
      (order.userId && order.userId === req.user!.userId);
    const isAdmin = req.user!.role === 'platform_admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

export default router;
