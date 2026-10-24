import { fetchAPI } from './config';

// Commissions et reversements aux vendeurs. L'argent est envoyé hors du site (Mobile Money / virement) ;
// le site enregistre le reversement avec sa référence et verrouille les commandes concernées.

export type PayoutMethodId = 'mvola' | 'orange_money' | 'airtel_money' | 'bank_transfer';

export const PAYOUT_METHOD_LABELS: Record<PayoutMethodId, string> = {
  mvola: 'MVola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  bank_transfer: 'Virement bancaire',
};

export const PAYOUT_METHOD_OPTIONS = (Object.keys(PAYOUT_METHOD_LABELS) as PayoutMethodId[]).map((value) => ({
  value,
  label: PAYOUT_METHOD_LABELS[value],
}));

export interface PayoutDetails {
  method: PayoutMethodId | null;
  number: string | null;
  accountName: string | null;
}

// ---------- Administrateur ----------

export interface AdminPayoutSeller {
  id: string;
  name: string;
  contactEmail: string;
  /** Taux propre au vendeur ; null = taux par défaut */
  commissionRate: number | null;
  effectiveRate: number;
  payout: PayoutDetails;
  eligible: { count: number; amount: number; commission: number };
  pending: { count: number; amount: number };
  paidOut: { count: number; amount: number };
  commissionEarned: number;
}

export interface AdminPayoutSummary {
  defaultRate: number;
  maxRate: number;
  totals: { toPayOut: number; pending: number; paidOut: number; commissionEarned: number };
  sellers: AdminPayoutSeller[];
}

export interface EligibleOrder {
  id: string;
  orderNumber: string;
  updatedAt: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  commissionRate: number | null;
  commissionAmount: number | null;
  sellerAmount: number | null;
}

export interface PayoutRecord {
  id: string;
  amount: number;
  commissionTotal: number;
  ordersCount: number;
  method: PayoutMethodId;
  reference: string;
  paidAt: string;
  orderNumbers: string[];
}

export interface AdminPayoutRecord extends PayoutRecord {
  sellerId: string;
  sellerName: string;
  note: string | null;
}

export async function getPayoutSummary(token: string): Promise<AdminPayoutSummary> {
  return fetchAPI('/payouts/admin/summary', { token });
}

export async function getEligibleOrders(sellerId: string, token: string): Promise<{ orders: EligibleOrder[] }> {
  return fetchAPI(`/payouts/admin/sellers/${sellerId}/eligible`, { token });
}

export async function createPayout(
  sellerId: string,
  data: { method: PayoutMethodId; reference: string; note?: string; orderIds?: string[] },
  token: string
): Promise<{ success: boolean; payout: { id: string; amount: number }; orderNumbers: string[] }> {
  return fetchAPI(`/payouts/admin/sellers/${sellerId}/payouts`, { method: 'POST', body: JSON.stringify(data), token });
}

export async function getPayoutHistory(token: string, sellerId?: string): Promise<{ payouts: AdminPayoutRecord[] }> {
  const query = sellerId ? `?sellerId=${encodeURIComponent(sellerId)}` : '';
  return fetchAPI(`/payouts/admin/history${query}`, { token });
}

// rate = null : revenir au taux par défaut de la plateforme
export async function setSellerCommission(
  sellerId: string,
  rate: number | null,
  token: string
): Promise<{ success: boolean; commissionRate: number | null; effectiveRate: number }> {
  return fetchAPI(`/payouts/admin/sellers/${sellerId}/commission`, { method: 'PATCH', body: JSON.stringify({ rate }), token });
}

// ---------- Vendeur ----------

// in_progress : en route, ou livrée sans réception confirmée ; disputed : l'acheteur a signalé un problème
export type SellerOrderState = 'reversed' | 'to_receive' | 'in_progress' | 'disputed';

export interface SellerEarningLine {
  orderNumber: string;
  status: string;
  paidAt: string | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  commissionRate: number | null;
  commissionAmount: number | null;
  sellerAmount: number | null;
  state: SellerOrderState;
}

export interface SellerEarnings {
  defaultRate: number;
  /** Taux appliqué à mes nouvelles ventes */
  rate: number;
  hasCustomRate: boolean;
  payoutDetails: PayoutDetails;
  totals: { toReceive: number; inProgress: number; received: number; commissionPaid: number };
  orders: SellerEarningLine[];
  payouts: PayoutRecord[];
}

export async function getSellerEarnings(token: string): Promise<SellerEarnings> {
  return fetchAPI('/payouts/seller/summary', { token });
}

export async function savePayoutDetails(
  data: { method: PayoutMethodId; number: string; accountName?: string },
  token: string
): Promise<{ success: boolean; payoutDetails: PayoutDetails }> {
  return fetchAPI('/payouts/seller/payout-details', { method: 'PUT', body: JSON.stringify(data), token });
}
