import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-MG', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price) + ' Ar';
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length).trim() + '...';
}

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

export function getProductivityLabel(productivity: string): string {
  const labels: Record<string, string> = {
    'faible': 'Faible',
    'moyenne': 'Moyenne',
    'élevée': 'Élevée',
    'très-élevée': 'Très élevée',
  };
  return labels[productivity] || productivity;
}

export function getProductivityColor(productivity: string): string {
  const colors: Record<string, string> = {
    'faible': 'bg-yellow-200',
    'moyenne': 'bg-orange-300',
    'élevée': 'bg-green-400',
    'très-élevée': 'bg-green-500',
  };
  return colors[productivity] || 'bg-gray-300';
}

// « 90 kg », « 500 pièce(s) » : les unités de poids/volume ne prennent pas de « (s) ».
const INVARIABLE_UNITS = new Set(['kg', 'g', 'l', 'L']);
export function formatQuantity(quantity: number, unit: string): string {
  return INVARIABLE_UNITS.has(unit) ? `${quantity} ${unit}` : `${quantity} ${unit}(s)`;
}

// Visuels du template Electro (public/electro/img) : repli des produits sans photo.
const ELECTRONICS_FALLBACKS = [3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(
  (n) => `/electro/img/product-${n}.png`
);

// Image d'un produit : sa photo, sinon un visuel de public/electro/img choisi de façon stable à partir de l'id.
export function getProductImage(
  product: { id: string; category: string; images: string[] },
  index = 0
): string {
  const own = product.images[index];
  if (own) return own;
  const hash = product.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return ELECTRONICS_FALLBACKS[hash % ELECTRONICS_FALLBACKS.length];
}

export function getCategoryLabel(category: string): string {
  // Normaliser la catégorie (remplacer tirets par underscores)
  const normalized = category.replace(/-/g, '_');
  const labels: Record<string, string> = {
    'accessoires': 'Accessoires',
    'electronique': 'Électronique & Photo',
    'ordinateurs': 'Ordinateurs & Écrans',
    'mobiles': 'Mobiles & Tablettes',
    'smartphones': 'Smartphones',
  };
  return labels[normalized] || labels[category] || category;
}

export function getBadgeLabel(badge: string): string {
  const labels: Record<string, string> = {
    'bio': 'Bio',
    'plein_air': 'Plein air',
    'nouveau': 'Nouveau',
    'promo': 'Promo',
    'populaire': 'Populaire',
  };
  return labels[badge] || badge;
}

export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `FDV-${timestamp}-${randomStr}`.toUpperCase();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
  return phoneRegex.test(phone);
}

export function validatePostalCode(postalCode: string): boolean {
  const postalCodeRegex = /^[0-9]{5}$/;
  return postalCodeRegex.test(postalCode);
}

export function getDeliveryEstimate(method: string): string {
  const estimates: Record<string, string> = {
    'standard': '3-5 jours ouvrés',
    'express': '1-2 jours ouvrés',
    'retrait': 'Disponible sous 24h',
  };
  return estimates[method] || '';
}

// Miroir de backend/src/lib/shipping.ts — garder les deux alignés.
export const FREE_SHIPPING_THRESHOLD = 100000; // Ar
export const SHIPPING_COSTS: Record<string, number> = {
  standard: 3000,
  express: 5000,
  retrait: 0,
};

/**
 * Frais de livraison en Ariary (aperçu ; le montant facturé est recalculé côté backend).
 *
 * - `hasFreeShippingItem` : le panier contient au moins un produit « livraison gratuite »
 *   → livraison offerte, on ignore la méthode et le seuil.
 * - sinon : retrait gratuit, gratuit au-dessus du seuil, sinon forfait par méthode.
 */
export function getShippingCost(
  method: string,
  subtotal: number,
  hasFreeShippingItem = false
): number {
  if (hasFreeShippingItem) return 0;
  if (method === 'retrait') return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_COSTS[method] ?? 0;
}

// Miroir de backend/src/lib/wholesale.ts : vente en gros uniquement, quantité minimum plancher.
export const MIN_WHOLESALE_QTY = 10;

export interface SellerGroup<T> {
  sellerId: string | null;
  sellerName: string | null;
  items: T[];
}

// Regroupe les lignes du panier par vendeur (null = plateforme) : le backend crée une commande par
// vendeur, avec ses propres frais de livraison.
export function groupBySeller<T extends { sellerId?: string | null; sellerName?: string | null }>(
  items: T[]
): SellerGroup<T>[] {
  const groups = new Map<string | null, SellerGroup<T>>();
  for (const item of items) {
    const key = item.sellerId ?? null;
    const group = groups.get(key) ?? { sellerId: key, sellerName: item.sellerName ?? null, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

// Miroir de backend/src/lib/pricing.ts — garder les deux alignés.
/**
 * Prix unitaire applicable pour une quantité donnée (aperçu ; le prix facturé est
 * recalculé côté backend au moment de la commande).
 */
export function resolveUnitPrice(
  basePrice: number,
  priceTiers: { minQty: number; unitPrice: number }[] | null | undefined,
  quantity: number
): number {
  const applicable = (priceTiers ?? [])
    .filter((tier) => quantity >= tier.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  return applicable ? applicable.unitPrice : basePrice;
}

/** Poids indicatif formaté, ex. « ≈ 1,8 kg ». */
export function formatWeight(kg: number): string {
  return `≈ ${kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
}

/** true si le produit n'est pas encore disponible (date de dispo dans le futur) → réservable en précommande. */
export function isUpcoming(availableFrom?: string | null): boolean {
  if (!availableFrom) return false;
  const date = new Date(availableFrom);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

/**
 * Fenêtre de livraison d'un produit en précommande : le jour de disponibilité,
 * ou au plus tard le lendemain. Ex. « 20 ou 21 décembre 2026 ».
 */
export function formatDeliveryWindow(availableFrom: string): string {
  const start = new Date(availableFrom);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const tail = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(end);
    return `${start.getDate()} ou ${end.getDate()} ${tail}`;
  }
  return `${formatDate(start)} ou ${formatDate(end)}`;
}
