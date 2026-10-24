import { fetchAPI } from './config';

// Codes promo et parrainage (remise sur les articles, prise en charge par la plateforme)

export interface PromoPreview {
  code: string;
  /** Remise en Ariary sur le montant d'articles envoyé (la commande la recalcule avec les prix du serveur) */
  discount: number;
  /** « -10 % (max 20 000 Ar) », « Parrainage -10 % », « -5 000 Ar » */
  label: string;
  description: string | null;
}

export function previewPromo(code: string, itemsSubtotal: number, token?: string): Promise<PromoPreview> {
  return fetchAPI('/promo/preview', { method: 'POST', token, body: JSON.stringify({ code, itemsSubtotal }) });
}

export interface ReferralInfo {
  /** Faux si le parrainage est désactivé sur la plateforme */
  enabled: boolean;
  code: string;
  /** Lien à partager : la remise s'applique automatiquement au moment de payer */
  link: string;
  discountPercent: number;
  discountMax: number;
  rewardAmount: number;
  /** Filleuls dont la première commande a été payée */
  referrals: number;
  rewards: { code: string; amount: number; endsAt: string | null; status: 'available' | 'used' | 'expired' }[];
}

export function getReferral(token: string): Promise<ReferralInfo> {
  return fetchAPI('/promo/referral', { token });
}

// ---------- Administration ----------

export interface AdminPromoCode {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  description: string | null;
  label: string;
  /** Total des remises accordées avec ce code (coût pour la plateforme) */
  totalDiscount: number;
  createdAt: string;
}

export interface AdminPromoList {
  codes: AdminPromoCode[];
  referral: {
    uses: number;
    totalDiscount: number;
    settings: { discountPercent: number; discountMax: number; rewardAmount: number; rewardDays: number };
  };
}

export function getAdminPromoCodes(token: string): Promise<AdminPromoList> {
  return fetchAPI('/promo/admin', { token });
}

export interface PromoCodeInput {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  maxDiscount?: number | null;
  minSubtotal?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxUses?: number | null;
  perUserLimit?: number;
  firstOrderOnly?: boolean;
  description?: string | null;
}

export function createPromoCode(data: PromoCodeInput, token: string): Promise<{ success: boolean; code: AdminPromoCode }> {
  return fetchAPI('/promo/admin', { method: 'POST', token, body: JSON.stringify(data) });
}

export function updatePromoCode(
  id: string,
  data: { isActive?: boolean; endsAt?: string | null; maxUses?: number | null; description?: string | null },
  token: string
): Promise<{ success: boolean }> {
  return fetchAPI(`/promo/admin/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) });
}
