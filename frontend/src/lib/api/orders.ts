import { fetchAPI } from './config';
import type { PaymentMethodId } from './payments';

// Paiement garanti : la plateforme garde l'argent jusqu'à la réception de la commande. L'acheteur confirme la
// réception (le vendeur peut alors être payé) ou signale un problème ; l'administrateur tranche les litiges.

export type ProtectionState = 'none' | 'protected' | 'disputed' | 'received' | 'refunded';

/** Champs du paiement garanti renvoyés avec chaque commande */
export interface OrderProtection {
  protection: ProtectionState;
  deliveredAt: string | null;
  receivedAt: string | null;
  /** Fin du délai pour signaler un problème (null tant que la commande n'est pas livrée) */
  disputeDeadline: string | null;
  disputeReason: string | null;
  disputeResolution: 'refund' | 'release' | null;
  /** Décision de l'administrateur, communiquée à l'acheteur */
  disputeNote: string | null;
  canConfirmReceipt: boolean;
  canOpenDispute: boolean;
}

export function confirmReceipt(orderId: string, token: string): Promise<{ success: boolean; message: string }> {
  return fetchAPI(`/orders/${orderId}/confirm-receipt`, { method: 'POST', token });
}

export function openDispute(orderId: string, reason: string, token: string): Promise<{ success: boolean; message: string }> {
  return fetchAPI(`/orders/${orderId}/dispute`, { method: 'POST', token, body: JSON.stringify({ reason }) });
}

// ---------- Administration ----------

export interface AdminDispute extends OrderProtection {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  sellerName: string | null;
  status: string;
  total: number;
  paymentMethod: PaymentMethodId | null;
  disputeOpenedAt: string;
  disputeResolvedAt: string | null;
  items: { name: string; quantity: number; price: number }[];
}

export function getAdminDisputes(token: string, all = false): Promise<{ disputes: AdminDispute[] }> {
  return fetchAPI(`/orders/admin/disputes${all ? '?status=all' : ''}`, { token });
}

export function resolveDispute(
  orderId: string,
  resolution: 'refund' | 'release',
  note: string,
  token: string
): Promise<{ success: boolean }> {
  return fetchAPI(`/orders/admin/${orderId}/dispute`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ resolution, ...(note.trim() ? { note: note.trim() } : {}) }),
  });
}
