import { fetchAPI } from './config';
import { CompanyOrder, DeliveryMethod } from '@/types';
import type { PaymentMethodId, PaymentStatus } from './payments';

interface CheckoutData {
  items: { productId: string; quantity: number }[];
  shippingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country?: string;
  };
  deliveryMethod: DeliveryMethod;
  // Paiement en ligne obligatoire (Mobile Money) : ni paiement différé ni à la livraison
  paymentMethod: PaymentMethodId;
  notes?: string;
  // Commande sans compte : coordonnées du visiteur (`website` est un champ piège anti-robot)
  guest?: { name: string; email: string; phone: string };
  website?: string;
}

interface CheckoutResponse {
  success: boolean;
  message: string;
  orderId?: string;
  orderNumber?: string;
  total?: number;
  // Instructions de paiement : un seul règlement pour toutes les commandes du panier
  payment?: {
    method: PaymentMethodId;
    label: string;
    number: string;
    accountName: string;
    totalAmount: number;
    /** Date limite de paiement ; null si l'annulation automatique est désactivée */
    expiresAt: string | null;
  };
  // Une commande par vendeur : `orders` liste toutes les commandes créées
  orders?: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    sellerName: string | null;
  }[];
}

// `token` absent = commande sans compte (les coordonnées sont alors dans `data.guest`)
export async function createOrder(data: CheckoutData, token?: string): Promise<CheckoutResponse> {
  return fetchAPI<CheckoutResponse>('/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

export async function getOrderByNumber(orderNumber: string, token: string): Promise<CompanyOrder> {
  return fetchAPI<CompanyOrder>(`/checkout/${orderNumber}`, { token });
}

export async function getMyOrders(token: string): Promise<{ orders: CompanyOrder[] }> {
  return fetchAPI<{ orders: CompanyOrder[] }>('/checkout/orders/mine', { token });
}

export interface GuestOrder {
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: PaymentMethodId | null;
  paymentStatus: PaymentStatus;
  paymentRejectionReason: string | null;
  sellerName: string | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: string;
  cancelReason: string | null;
  createdAt: string;
  address: { street: string; city: string; postalCode: string; country: string } | null;
  items: { name: string; quantity: number; price: number }[];
}

// Suivi d'une commande passée sans compte : numéro de commande + e-mail saisi au paiement
export async function trackGuestOrder(orderNumber: string, email: string): Promise<GuestOrder> {
  const params = new URLSearchParams({ orderNumber, email });
  return fetchAPI<GuestOrder>(`/checkout/track?${params.toString()}`);
}

// ---------- Administration des commandes (platform_admin) ----------

// Toutes les commandes ; `T` = forme utilisée par l'écran admin
export async function getAllOrders<T>(token: string): Promise<{ orders: T[] }> {
  return fetchAPI<{ orders: T[] }>('/checkout/orders', { token });
}

// Changement de statut ; `reason` accompagne une annulation
export async function updateOrderStatus(orderId: string, status: string, token: string, reason?: string) {
  return fetchAPI(`/checkout/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(reason !== undefined ? { reason } : {}) }),
    token,
  });
}
