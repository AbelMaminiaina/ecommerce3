import { fetchAPI } from './config';
import type { Product } from '@/types';
import type { PaymentMethodId } from './payments';
import type { ProtectionState } from './orders';

export interface SellerProductInput {
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  price: number;
  images: string[];
  characteristics: string[];
  moq: number;
  unit: string;
  stockQuantity: number;
  estimatedWeightKg?: number | null;
  freeShipping: boolean;
  priceTiers: { minQty: number; unitPrice: number }[];
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerType: 'professionnel' | 'particulier';
  contactEmail: string | null;
  contactPhone: string | null;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: string;
  // Paiement Mobile Money : la commande ne peut être traitée qu'une fois le paiement confirmé
  paymentMethod: PaymentMethodId | null;
  paymentStatus: 'awaiting' | 'submitted' | 'paid' | 'rejected';
  // Part du vendeur, calculée à la confirmation du paiement (reversed = déjà versée par la plateforme)
  commissionRate?: number | null;
  commissionAmount?: number | null;
  sellerAmount?: number | null;
  reversed?: boolean;
  /** Paiement garanti : le vendeur est payé une fois la réception confirmée */
  protection?: ProtectionState;
  disputeReason?: string | null;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  address: { street: string; city: string; postalCode: string; country: string } | null;
  items: { name: string; quantity: number; price: number }[];
}

export async function getSellerProducts(token: string) {
  return fetchAPI<{ products: Product[]; minWholesaleQty: number }>('/seller/products', { token });
}

export async function createSellerProduct(data: SellerProductInput, token: string) {
  return fetchAPI<{ success: boolean; product: Product }>('/seller/products', {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

export async function updateSellerProduct(id: string, data: SellerProductInput, token: string) {
  return fetchAPI<{ success: boolean; product: Product }>(`/seller/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    token,
  });
}

export async function updateSellerStock(id: string, stockQuantity: number, token: string) {
  return fetchAPI(`/seller/products/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ stockQuantity }),
    token,
  });
}

export async function setSellerProductActive(id: string, isActive: boolean, token: string) {
  return fetchAPI(`/seller/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
    token,
  });
}

export async function deleteSellerProduct(id: string, token: string) {
  return fetchAPI<{ success: boolean; message: string }>(`/seller/products/${id}`, { method: 'DELETE', token });
}

export async function getSellerOrders(token: string) {
  return fetchAPI<{ orders: SellerOrder[] }>('/checkout/orders/seller', { token });
}

export async function updateSellerOrderStatus(orderId: string, status: SellerOrder['status'], token: string, reason?: string) {
  return fetchAPI(`/checkout/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
    token,
  });
}

// Modération (administrateur)
export async function getProductsToModerate(status: 'pending' | 'approved' | 'rejected' | 'all', token: string) {
  return fetchAPI<{ products: (Product & { seller: { id: string; name: string; contactEmail: string } })[]; total: number }>(
    `/admin/products?status=${status}`,
    { token }
  );
}

export async function approveProduct(id: string, token: string) {
  return fetchAPI(`/admin/products/${id}/approve`, { method: 'PATCH', token });
}

export async function rejectProduct(id: string, reason: string, token: string) {
  return fetchAPI(`/admin/products/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }), token });
}
