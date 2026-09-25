import nodemailer from 'nodemailer';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  availableFrom?: Date | string | null;
}

interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

interface OrderData {
  orderNumber: string;
  companyName: string;
  contactEmail: string;
  contactPhone?: string;
  address: Address | null;
  deliveryMethod: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  status: string;
  // Instructions de paiement Mobile Money (le paiement est obligatoire pour toute commande)
  payment?: {
    methodLabel: string;
    number: string;
    accountName: string;
    /** Montant total à envoyer (somme des commandes d'un même panier) */
    totalToPay: number;
    /** Date limite : passé ce délai, la commande non payée est annulée automatiquement */
    expiresAt?: Date | null;
  };
  createdAt: Date;
}

interface CancellationEmailData {
  orderNumber: string;
  companyName: string;
  contactEmail: string;
  reason?: string;
  items: OrderItem[];
  total: number;
  cancelledAt: Date;
}

interface StatusUpdateEmailData {
  orderNumber: string;
  companyName: string;
  contactEmail: string;
  items: OrderItem[];
  total: number;
  deliveryMethod: string;
  address: Address | null;
  updatedAt: Date;
}

interface CompanyDecisionEmailData {
  companyName: string;
  contactEmail: string;
}

type CompanyApprovedEmailData = CompanyDecisionEmailData;

interface CompanyRejectedEmailData extends CompanyDecisionEmailData {
  reason?: string;
}

const deliveryLabels: Record<string, string> = {
  standard: 'Livraison standard (3-5 jours)',
  express: 'Livraison express (1-2 jours)',
  retrait: 'Retrait sur place',
};

// Nom de la plateforme, affiché dans les e-mails
const BRAND_NAME = process.env.PLATFORM_NAME || 'Plateforme B2B';

// Email admin pour notifications internes
// Adresse e-mail du site (lue à chaque envoi) : ADMIN_EMAIL, sinon l'adresse de contact du site
const adminEmail = () => process.env.ADMIN_EMAIL || 'savatry.milamina@gmail.com';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-MG', {
    style: 'decimal',
    minimumFractionDigits: 0,
  }).format(price) + ' Ar';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function formatDateOnly(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(date));
}

// Date de disponibilité (réservation / précommande) figée sur la ligne de commande.
function isReservationItem(item: OrderItem): boolean {
  if (!item.availableFrom) return false;
  const d = new Date(item.availableFrom);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

// Petite ligne « Réservation — livraison à partir du … » à afficher sous le nom du produit.
function reservationNoteHTML(item: OrderItem): string {
  if (!isReservationItem(item)) return '';
  return `<br><span style="color: #b45309; font-size: 12px;">📅 Réservation — livraison à partir du ${formatDateOnly(item.availableFrom!)}</span>`;
}

function addressHTML(address: Address | null): string {
  if (!address) return 'Retrait sur place';
  return `${address.street}<br>${address.postalCode} ${address.city}`;
}

// Template e-mail pour l'ENTREPRISE CLIENTE — confirmation de commande + facture
function generateCustomerEmailHTML(order: OrderData): string {
  const itemsHTML = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.name}${reservationNoteHTML(item)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.price)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('');

  const reservationItems = order.items.filter(isReservationItem);
  const reservationBannerHTML = reservationItems.length
    ? `<div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">📅 Votre commande contient une réservation</p>
        <p style="margin: 6px 0 0 0; color: #78350f; font-size: 13px;">
          ${reservationItems
            .map((it) => `${it.name} — livraison à partir du ${formatDateOnly(it.availableFrom!)}`)
            .join('<br>')}
        </p>
      </div>`
    : '';

  const statusLabel = order.status === 'processing'
    ? 'Confirmée - En préparation'
    : 'En attente de confirmation';

  const statusColor = order.status === 'processing' ? '#16a34a' : '#f59e0b';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Confirmation de commande - ${order.orderNumber}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">

  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: white;">
      <h1 style="margin: 0; font-size: 28px;">${BRAND_NAME}</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Plateforme de vente en gros</p>
    </div>

    <div style="padding: 30px;">

      <!-- Confirmation Message -->
      <div style="text-align: center; padding: 20px 0 30px 0;">
        <div style="font-size: 50px; margin-bottom: 15px;">📦</div>
        <h2 style="margin: 0; color: #1e3a5f; font-size: 24px;">Commande enregistrée !</h2>
        <p style="margin: 10px 0 0 0; color: #666;">Merci ${order.companyName} pour votre commande</p>
      </div>

      <!-- Order Info -->
      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 5px 0;"><strong>N° de commande:</strong></td>
            <td style="text-align: right; font-family: monospace; font-size: 16px; color: #1e3a5f;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Date:</strong></td>
            <td style="text-align: right;">${formatDate(order.createdAt)}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Statut:</strong></td>
            <td style="text-align: right;">
              <span style="display: inline-block; padding: 4px 12px; background-color: ${statusColor}; color: white; border-radius: 12px; font-size: 12px;">
                ${statusLabel}
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Payment instructions -->
      ${order.payment ? `
      <div style="background-color: #fff7ed; border: 2px solid #f28b00; padding: 20px; margin-bottom: 25px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 15px;">
          <span style="font-size: 40px;">📱</span>
          <h3 style="margin: 10px 0 5px 0; color: #9a3412;">Paiement par ${order.payment.methodLabel}</h3>
          <p style="margin: 0; color: #9a3412; font-size: 14px;">Votre commande sera traitée dès que votre paiement aura été vérifié.</p>
        </div>

        <div style="background-color: white; border-radius: 8px; padding: 15px; text-align: center;">
          <p style="margin: 0 0 5px 0; color: #666; font-size: 12px;">MONTANT À ENVOYER</p>
          <p style="margin: 0; font-size: 28px; font-weight: bold; color: #9a3412;">${formatPrice(order.payment.totalToPay)}</p>
          ${order.payment.expiresAt ? `<p style="margin: 8px 0 0 0; color: #b45309; font-size: 13px;">À régler avant le <strong>${formatDate(order.payment.expiresAt)}</strong> : passé ce délai, la commande est annulée automatiquement.</p>` : ''}
        </div>

        <div style="background-color: white; border-radius: 8px; padding: 15px; margin-top: 10px; text-align: center;">
          <p style="margin: 0 0 5px 0; color: #666; font-size: 12px;">NUMÉRO ${order.payment.methodLabel.toUpperCase()}</p>
          <p style="margin: 0; font-size: 22px; font-weight: bold; color: #333;">${order.payment.number}</p>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 13px;">Bénéficiaire : ${order.payment.accountName}</p>
        </div>

        <p style="margin: 15px 0 0 0; color: #7c2d12; font-size: 13px; text-align: center;">
          Après l'envoi, saisissez la <strong>référence de la transaction</strong> sur la page de paiement de votre commande
          (lien « Suivi de commande » du site).
        </p>
      </div>
      ` : `
      <div style="background-color: #fff7ed; border: 2px solid #f28b00; padding: 20px; margin-bottom: 25px; border-radius: 12px; text-align: center;">
        <h3 style="margin: 0 0 5px 0; color: #9a3412;">Montant à régler : ${formatPrice(order.total)}</h3>
        <p style="margin: 0; color: #9a3412; font-size: 14px;">Paiement par Mobile Money</p>
      </div>
      `}

      <!-- Delivery Info -->
      <div style="display: table; width: 100%; margin-bottom: 25px;">
        <div style="display: table-cell; width: 50%; padding-right: 10px; vertical-align: top;">
          <div style="background-color: #f0f5fa; border-radius: 8px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">📦 MODE DE LIVRAISON</h3>
            <p style="margin: 0; font-weight: bold;">${deliveryLabels[order.deliveryMethod] || order.deliveryMethod}</p>
          </div>
        </div>
        <div style="display: table-cell; width: 50%; padding-left: 10px; vertical-align: top;">
          <div style="background-color: #f0f5fa; border-radius: 8px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">📍 ADRESSE</h3>
            <p style="margin: 0;">${addressHTML(order.address)}</p>
          </div>
        </div>
      </div>

      ${reservationBannerHTML}

      <!-- Items Table -->
      <h3 style="margin: 0 0 15px 0; color: #333;">Récapitulatif de votre commande</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #1e3a5f; color: white;">
            <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 0;">Produit</th>
            <th style="padding: 12px; text-align: center;">Qté</th>
            <th style="padding: 12px; text-align: right;">Prix unitaire</th>
            <th style="padding: 12px; text-align: right; border-radius: 0 8px 0 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0;">Sous-total</td>
            <td style="text-align: right;">${formatPrice(order.subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Frais de livraison</td>
            <td style="text-align: right;">${order.shippingCost > 0 ? formatPrice(order.shippingCost) : '<span style="color: #16a34a;">Gratuit</span>'}</td>
          </tr>
          <tr style="font-size: 20px; font-weight: bold; color: #1e3a5f;">
            <td style="padding: 15px 0 0 0; border-top: 2px solid #e5e5e5;">TOTAL FACTURÉ</td>
            <td style="text-align: right; padding: 15px 0 0 0; border-top: 2px solid #e5e5e5;">${formatPrice(order.total)}</td>
          </tr>
        </table>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding: 25px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e3a5f;">Une question sur votre commande ?</p>
      <p style="margin: 0; color: #666; font-size: 14px;">
        📧 ${adminEmail()}
      </p>
    </div>

  </div>

</body>
</html>
  `;
}

// Template e-mail pour l'ADMIN
function generateAdminNotificationHTML(order: OrderData): string {
  const itemsList = order.items
    .map((item) => {
      const resa = isReservationItem(item)
        ? ` <span style="color:#b45309;">(réservation — dispo le ${formatDateOnly(item.availableFrom!)})</span>`
        : '';
      return `• ${item.name} x${item.quantity} = ${formatPrice(item.price * item.quantity)}${resa}`;
    })
    .join('<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nouvelle commande - ${order.orderNumber}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background-color: #eff6ff; border: 2px solid #2c5282; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #1e3a5f; font-size: 20px;">🔔 Nouvelle commande reçue !</h1>
  </div>

  <div style="background-color: white; border: 1px solid #e5e5e5; border-radius: 12px; padding: 25px;">

    <h2 style="margin: 0 0 20px 0; color: #1e3a5f;">Commande ${order.orderNumber}</h2>

    <table style="width: 100%; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>Client:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">${order.companyName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>Contact:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><a href="mailto:${order.contactEmail}">${order.contactEmail}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>Adresse:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">${addressHTML(order.address)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>Livraison:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">${deliveryLabels[order.deliveryMethod] || order.deliveryMethod}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>Paiement:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">${order.payment ? `${order.payment.methodLabel} — en attente de vérification` : 'Mobile Money'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0;"><strong>Date:</strong></td>
        <td style="padding: 8px 0;">${formatDate(order.createdAt)}</td>
      </tr>
    </table>

    <div style="background-color: #f8f8f8; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 10px 0; font-size: 14px;">Produits commandés:</h3>
      <p style="margin: 0; font-family: monospace;">${itemsList}</p>
    </div>

    <div style="background-color: #1e3a5f; color: white; border-radius: 8px; padding: 20px; text-align: center;">
      <p style="margin: 0; font-size: 14px;">MONTANT FACTURÉ</p>
      <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold;">${formatPrice(order.total)}</p>
    </div>

  </div>

</body>
</html>
  `;
}

// Template e-mail d'ANNULATION pour l'entreprise cliente
function generateCancellationEmailHTML(order: CancellationEmailData): string {
  const itemsHTML = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.name}${reservationNoteHTML(item)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Commande annulée - ${order.orderNumber}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">

  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white;">
      <h1 style="margin: 0; font-size: 28px;">${BRAND_NAME}</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Plateforme de vente en gros</p>
    </div>

    <div style="padding: 30px;">

      <div style="text-align: center; padding: 20px 0 30px 0;">
        <div style="font-size: 50px; margin-bottom: 15px;">❌</div>
        <h2 style="margin: 0; color: #dc2626; font-size: 24px;">Commande annulée</h2>
        <p style="margin: 10px 0 0 0; color: #666;">Bonjour ${order.companyName}, votre commande a été annulée</p>
      </div>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 5px 0;"><strong>N° de commande:</strong></td>
            <td style="text-align: right; font-family: monospace; font-size: 16px; color: #dc2626;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Date d'annulation:</strong></td>
            <td style="text-align: right;">${formatDate(order.cancelledAt)}</td>
          </tr>
        </table>
      </div>

      ${order.reason ? `
      <div style="background-color: #fef2f2; border: 2px solid #fca5a5; padding: 20px; margin-bottom: 25px; border-radius: 12px;">
        <h3 style="margin: 0 0 10px 0; color: #991b1b; font-size: 14px;">MOTIF DE L'ANNULATION</h3>
        <p style="margin: 0; color: #7f1d1d;">${order.reason}</p>
      </div>
      ` : ''}

      <h3 style="margin: 0 0 15px 0; color: #333;">Commande concernée</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #6b7280; color: white;">
            <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 0;">Produit</th>
            <th style="padding: 12px; text-align: center;">Qté</th>
            <th style="padding: 12px; text-align: right; border-radius: 0 8px 0 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; text-align: right;">
        <span style="color: #666;">Montant de la facture annulée : </span>
        <strong style="font-size: 18px;">${formatPrice(order.total)}</strong>
      </div>

    </div>

    <div style="padding: 25px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e3a5f;">Une question sur cette annulation ?</p>
      <p style="margin: 0; color: #666; font-size: 14px;">
        📧 ${adminEmail()}
      </p>
    </div>

  </div>

</body>
</html>
  `;
}

// Lignes du tableau produits, partagées par les templates de statut
function generateItemsRows(items: OrderItem[]): string {
  return items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.name}${reservationNoteHTML(item)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('');
}

// Template e-mail pour l'entreprise cliente — commande EXPÉDIÉE
function generateShippedEmailHTML(order: StatusUpdateEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Commande expédiée - ${order.orderNumber}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">

  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white;">
      <h1 style="margin: 0; font-size: 28px;">${BRAND_NAME}</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Plateforme de vente en gros</p>
    </div>

    <div style="padding: 30px;">

      <div style="text-align: center; padding: 20px 0 30px 0;">
        <div style="font-size: 50px; margin-bottom: 15px;">📦</div>
        <h2 style="margin: 0; color: #2563eb; font-size: 24px;">Commande expédiée !</h2>
        <p style="margin: 10px 0 0 0; color: #666;">Bonjour ${order.companyName}, votre commande est en route</p>
      </div>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 5px 0;"><strong>N° de commande:</strong></td>
            <td style="text-align: right; font-family: monospace; font-size: 16px; color: #2563eb;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Mode de livraison:</strong></td>
            <td style="text-align: right;">${deliveryLabels[order.deliveryMethod] || order.deliveryMethod}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Adresse:</strong></td>
            <td style="text-align: right;">${addressHTML(order.address)}</td>
          </tr>
        </table>
      </div>

      <h3 style="margin: 0 0 15px 0; color: #333;">Récapitulatif de votre commande</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #2563eb; color: white;">
            <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 0;">Produit</th>
            <th style="padding: 12px; text-align: center;">Qté</th>
            <th style="padding: 12px; text-align: right; border-radius: 0 8px 0 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsRows(order.items)}
        </tbody>
      </table>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; text-align: right;">
        <span style="color: #666;">Total de la commande : </span>
        <strong style="font-size: 18px;">${formatPrice(order.total)}</strong>
      </div>

    </div>

    <div style="padding: 25px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e3a5f;">Une question sur votre commande ?</p>
      <p style="margin: 0; color: #666; font-size: 14px;">
        📧 ${adminEmail()}
      </p>
    </div>

  </div>

</body>
</html>
  `;
}

// Template e-mail pour l'entreprise cliente — commande LIVRÉE
function generateDeliveredEmailHTML(order: StatusUpdateEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Commande livrée - ${order.orderNumber}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">

  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: white;">
      <h1 style="margin: 0; font-size: 28px;">${BRAND_NAME}</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Plateforme de vente en gros</p>
    </div>

    <div style="padding: 30px;">

      <div style="text-align: center; padding: 20px 0 30px 0;">
        <div style="font-size: 50px; margin-bottom: 15px;">✅</div>
        <h2 style="margin: 0; color: #1e3a5f; font-size: 24px;">Commande livrée !</h2>
        <p style="margin: 10px 0 0 0; color: #666;">Bonjour ${order.companyName}, votre commande vous a été livrée</p>
      </div>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 5px 0;"><strong>N° de commande:</strong></td>
            <td style="text-align: right; font-family: monospace; font-size: 16px; color: #1e3a5f;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>Livrée le:</strong></td>
            <td style="text-align: right;">${formatDate(order.updatedAt)}</td>
          </tr>
        </table>
      </div>

      <h3 style="margin: 0 0 15px 0; color: #333;">Récapitulatif de votre commande</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #1e3a5f; color: white;">
            <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 0;">Produit</th>
            <th style="padding: 12px; text-align: center;">Qté</th>
            <th style="padding: 12px; text-align: right; border-radius: 0 8px 0 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsRows(order.items)}
        </tbody>
      </table>

      <div style="background-color: #f8f8f8; border-radius: 8px; padding: 20px; text-align: right;">
        <span style="color: #666;">Total de la commande : </span>
        <strong style="font-size: 18px;">${formatPrice(order.total)}</strong>
      </div>

      <p style="margin-top: 25px; color: #666; font-size: 14px; text-align: center;">
        Merci pour votre confiance ! N'hésitez pas à repasser commande sur notre plateforme.
      </p>

    </div>

    <div style="padding: 25px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e3a5f;">Une question sur votre commande ?</p>
      <p style="margin: 0; color: #666; font-size: 14px;">
        📧 ${adminEmail()}
      </p>
    </div>

  </div>

</body>
</html>
  `;
}

// Template e-mail — compte entreprise APPROUVÉ
function generateCompanyApprovedHTML(data: CompanyApprovedEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Compte approuvé</title></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: white;">
      <h1 style="margin: 0; font-size: 26px;">${BRAND_NAME}</h1>
    </div>
    <div style="padding: 30px; text-align: center;">
      <div style="font-size: 50px; margin-bottom: 15px;">✅</div>
      <h2 style="margin: 0; color: #16a34a;">Votre compte professionnel est approuvé !</h2>
      <p style="margin: 15px 0; color: #666;">Bonjour ${data.companyName}, vous pouvez désormais consulter nos tarifs et passer commande.</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Template e-mail — compte entreprise REJETÉ
function generateCompanyRejectedHTML(data: CompanyRejectedEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Demande de compte</title></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white;">
      <h1 style="margin: 0; font-size: 26px;">${BRAND_NAME}</h1>
    </div>
    <div style="padding: 30px; text-align: center;">
      <h2 style="margin: 0; color: #dc2626;">Votre demande de compte n'a pas été acceptée</h2>
      <p style="margin: 15px 0; color: #666;">Bonjour ${data.companyName},</p>
      ${data.reason ? `<p style="margin: 15px 0; color: #333;">Motif : ${data.reason}</p>` : ''}
      <p style="margin: 15px 0; color: #666;">Pour toute question, contactez-nous à ${adminEmail()}.</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Envoyer email de confirmation (+ facture) à l'entreprise cliente
export async function sendOrderConfirmationEmail(order: OrderData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping email');
      return false;
    }

    const transporter = createTransporter();
    const customerHTML = generateCustomerEmailHTML(order);

    const statusText = 'En attente de paiement';

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: order.contactEmail,
      subject: `✅ Commande ${order.orderNumber} - ${statusText}`,
      html: customerHTML,
    });

    console.log(`✉️ Email client envoyé à ${order.contactEmail} pour commande ${order.orderNumber}`);

    await sendAdminNotificationEmail(order);

    return true;
  } catch (error) {
    console.error('Error sending customer email:', error);
    return false;
  }
}

// Envoyer notification à l'ADMIN
export async function sendAdminNotificationEmail(order: OrderData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping admin email');
      return false;
    }

    const transporter = createTransporter();
    const adminHTML = generateAdminNotificationHTML(order);

    await transporter.sendMail({
      from: `"${BRAND_NAME} - Système" <${process.env.SMTP_USER}>`,
      to: adminEmail(),
      subject: `🔔 Nouvelle commande ${order.orderNumber} - ${formatPrice(order.total)}`,
      html: adminHTML,
    });

    console.log(`✉️ Email admin envoyé à ${adminEmail()} pour commande ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending admin email:', error);
    return false;
  }
}

// Envoyer email d'annulation à l'entreprise cliente (avec motif)
export async function sendOrderCancellationEmail(order: CancellationEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping cancellation email');
      return false;
    }

    const transporter = createTransporter();
    const html = generateCancellationEmailHTML(order);

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: order.contactEmail,
      subject: `❌ Commande ${order.orderNumber} annulée`,
      html,
    });

    console.log(`✉️ Email d'annulation envoyé à ${order.contactEmail} pour commande ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    return false;
  }
}

// Envoyer email quand la commande est EXPÉDIÉE
export async function sendOrderShippedEmail(order: StatusUpdateEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping shipped email');
      return false;
    }

    const transporter = createTransporter();
    const html = generateShippedEmailHTML(order);

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: order.contactEmail,
      subject: `📦 Commande ${order.orderNumber} expédiée`,
      html,
    });

    console.log(`✉️ Email d'expédition envoyé à ${order.contactEmail} pour commande ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending shipped email:', error);
    return false;
  }
}

// Envoyer email quand la commande est LIVRÉE
export async function sendOrderDeliveredEmail(order: StatusUpdateEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping delivered email');
      return false;
    }

    const transporter = createTransporter();
    const html = generateDeliveredEmailHTML(order);

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: order.contactEmail,
      subject: `✅ Commande ${order.orderNumber} livrée`,
      html,
    });

    console.log(`✉️ Email de livraison envoyé à ${order.contactEmail} pour commande ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending delivered email:', error);
    return false;
  }
}

// Envoyer email quand le compte entreprise est APPROUVÉ
export async function sendCompanyApprovedEmail(data: CompanyApprovedEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping company approval email');
      return false;
    }

    const transporter = createTransporter();
    const html = generateCompanyApprovedHTML(data);

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: data.contactEmail,
      subject: `✅ Votre compte professionnel ${BRAND_NAME} est approuvé`,
      html,
    });

    return true;
  } catch (error) {
    console.error('Error sending company approval email:', error);
    return false;
  }
}

// Envoyer email quand le compte entreprise est REJETÉ
export async function sendCompanyRejectedEmail(data: CompanyRejectedEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping company rejection email');
      return false;
    }

    const transporter = createTransporter();
    const html = generateCompanyRejectedHTML(data);

    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: data.contactEmail,
      subject: `Votre demande de compte professionnel ${BRAND_NAME}`,
      html,
    });

    return true;
  } catch (error) {
    console.error('Error sending company rejection email:', error);
    return false;
  }
}

interface PaymentEmailData {
  orderNumbers: string[];
  companyName: string;
  contactEmail: string;
  totalAmount: number;
}

interface PaymentRejectedEmailData extends PaymentEmailData {
  reason: string;
}

function paymentEmailShell(title: string, color: string, icon: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="text-align: center; padding: 30px; background: ${color}; color: white;">
      <h1 style="margin: 0; font-size: 26px;">${BRAND_NAME}</h1>
    </div>
    <div style="padding: 30px; text-align: center;">
      <div style="font-size: 50px; margin-bottom: 15px;">${icon}</div>
      <h2 style="margin: 0;">${title}</h2>
      ${body}
    </div>
  </div>
</body>
</html>`;
}

// Envoyer email quand le PAIEMENT est CONFIRMÉ
export async function sendPaymentConfirmedEmail(data: PaymentEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping payment confirmation email');
      return false;
    }
    const transporter = createTransporter();
    const html = paymentEmailShell(
      'Paiement confirmé',
      'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
      '✅',
      `<p style="margin: 15px 0; color: #666;">Bonjour ${data.companyName}, nous avons bien reçu votre paiement de <strong>${formatPrice(data.totalAmount)}</strong>.</p>
      <p style="margin: 15px 0; color: #333;">Commande${data.orderNumbers.length > 1 ? 's' : ''} : <strong>${data.orderNumbers.join(', ')}</strong>. Elle${data.orderNumbers.length > 1 ? 's sont' : ' est'} en cours de traitement.</p>`
    );
    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: data.contactEmail,
      subject: `✅ Paiement confirmé - ${data.orderNumbers.join(', ')}`,
      html,
    });
    return true;
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    return false;
  }
}

// Envoyer email quand le PAIEMENT est REFUSÉ (le client peut saisir une nouvelle référence)
export async function sendPaymentRejectedEmail(data: PaymentRejectedEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping payment rejection email');
      return false;
    }
    const transporter = createTransporter();
    const html = paymentEmailShell(
      'Paiement non validé',
      'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
      '⚠️',
      `<p style="margin: 15px 0; color: #666;">Bonjour ${data.companyName}, nous n'avons pas pu valider votre paiement pour la commande ${data.orderNumbers.join(', ')} (${formatPrice(data.totalAmount)}).</p>
      <p style="margin: 15px 0; color: #dc2626;"><strong>Motif : ${data.reason}</strong></p>
      <p style="margin: 15px 0; color: #333;">Vous pouvez saisir une nouvelle référence de transaction depuis la page de suivi de votre commande.</p>`
    );
    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: data.contactEmail,
      subject: `⚠️ Paiement non validé - ${data.orderNumbers.join(', ')}`,
      html,
    });
    return true;
  } catch (error) {
    console.error('Error sending payment rejection email:', error);
    return false;
  }
}

interface PayoutPaidEmailData {
  companyName: string;
  contactEmail: string;
  amount: number;
  commissionTotal: number;
  methodLabel: string;
  reference: string;
  orderNumbers: string[];
}

// Envoyer email au VENDEUR quand la plateforme lui a REVERSÉ le produit de ses ventes
export async function sendPayoutPaidEmail(data: PayoutPaidEmailData): Promise<boolean> {
  try {
    if (!smtpConfigured()) {
      console.log('SMTP not configured, skipping payout email');
      return false;
    }
    const transporter = createTransporter();
    const html = paymentEmailShell(
      'Reversement effectué',
      'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
      '💸',
      `<p style="margin: 15px 0; color: #666;">Bonjour ${data.companyName}, nous vous avons versé <strong>${formatPrice(data.amount)}</strong> par ${data.methodLabel} pour ${data.orderNumbers.length} commande${data.orderNumbers.length > 1 ? 's' : ''} livrée${data.orderNumbers.length > 1 ? 's' : ''}.</p>
      <p style="margin: 15px 0; color: #333;">Commande${data.orderNumbers.length > 1 ? 's' : ''} : <strong>${data.orderNumbers.join(', ')}</strong><br>Commission de la plateforme retenue : ${formatPrice(data.commissionTotal)}<br>Référence de la transaction : <strong>${data.reference}</strong></p>`
    );
    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to: data.contactEmail,
      subject: `💸 Reversement de ${formatPrice(data.amount)} - ${data.orderNumbers.length} commande(s)`,
      html,
    });
    return true;
  } catch (error) {
    console.error('Error sending payout email:', error);
    return false;
  }
}
