import { fetchAPI } from './config';

// Paiement d'une commande : Mobile Money (instantané par l'API de l'opérateur, ou manuel : le client envoie le
// montant au numéro marchand puis saisit la référence de sa transaction, qu'un administrateur vérifie), carte
// bancaire (Stripe) ou PayPal (paiement en ligne uniquement, sur la page du prestataire).

export type PaymentMethodId = 'mvola' | 'orange_money' | 'airtel_money' | 'stripe' | 'paypal';

/** Moyens de paiement en ligne uniquement (pas de numéro marchand ni de référence à saisir) */
export const ONLINE_PAYMENT_METHODS: readonly PaymentMethodId[] = ['stripe', 'paypal'];

/** Icône Bootstrap Icons d'un moyen de paiement */
export const paymentMethodIcon = (id: PaymentMethodId | null | undefined): string =>
  id === 'stripe' ? 'bi-credit-card' : id === 'paypal' ? 'bi-paypal' : 'bi-phone';
export type PaymentStatus = 'awaiting' | 'submitted' | 'paid' | 'rejected';

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  label: string;
  /** Numéro marchand (vide pour la carte bancaire et PayPal) */
  number: string;
  accountName: string;
  /** Paiement instantané par l'API du prestataire (sinon : envoi manuel + référence) */
  automatic: boolean;
  /** Paiement manuel par référence possible (Mobile Money uniquement) */
  manual: boolean;
}

// Demande de paiement automatique (MVola, Orange Money, Airtel Money, Stripe, PayPal) : le site vérifie le résultat
// auprès du prestataire
export type PaymentAttemptStatus = 'pending' | 'completed' | 'failed' | 'review';

export interface PaymentAttempt {
  id: string;
  provider: PaymentMethodId;
  status: PaymentAttemptStatus;
  failureReason: string | null;
  /** Numéro du client (vide pour Orange Money : il le saisit sur la page d'Orange) */
  payerPhone: string;
  /** Page de paiement du prestataire (Orange Money, Stripe, PayPal), tant que la demande est en cours */
  paymentUrl: string | null;
  createdAt: string;
}

// Comment se déroule le paiement instantané d'un panier :
//  - push : le client donne son numéro et confirme la demande sur son téléphone (MVola, Airtel Money) ;
//  - redirect : le client est envoyé sur la page de paiement du prestataire (Orange Money, Stripe, PayPal).
export interface InstantPayment {
  provider: PaymentMethodId;
  label: string;
  /** Mobile Money, ou paiement en ligne uniquement (carte bancaire, PayPal) */
  kind: 'mobile_money' | 'online';
  flow: 'push' | 'redirect';
  /** Préfixes de numéro acceptés, pour l'affichage (« 034 ou 038 ») */
  phonePrefixes: string;
  phonePlaceholder: string;
}

export interface PaymentSummary {
  paymentStatus: PaymentStatus;
  /** Paiement instantané proposé pour ce panier (opérateur configuré côté serveur) */
  automatic: boolean;
  /** Paiement de démonstration : opérateurs simulés, aucun argent réel n'est débité */
  demo: boolean;
  /** Fonctionnement du paiement instantané (null quand il n'est pas proposé) */
  instant: InstantPayment | null;
  /** Dernière demande de paiement automatique (null pour un paiement purement manuel) */
  attempt: PaymentAttempt | null;
  /** Date limite de paiement (annulation automatique passé ce délai) ; null si sans objet */
  expiresAt: string | null;
  /** Motif quand la commande a été annulée (ex. non payée dans le délai) */
  cancelReason: string | null;
  method: PaymentMethodId | null;
  methodLabel: string | null;
  /** Paiement manuel par référence possible (Mobile Money) ; faux pour la carte bancaire et PayPal */
  manual: boolean;
  number: string | null;
  accountName: string | null;
  totalAmount: number;
  reference: string | null;
  payerPhone: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  orders: {
    orderNumber: string;
    sellerName: string | null;
    total: number;
    status: string;
    paymentStatus: PaymentStatus;
  }[];
}

export interface AdminPayment extends PaymentSummary {
  id: string;
  /** Le paiement a été lancé par l'API de l'opérateur (référence « MVOLA:… », « ORANGE_MONEY:… », « AIRTEL_MONEY:… ») */
  automatic: boolean;
  buyer: { name: string; email: string | null; phone: string | null };
  createdAt: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  awaiting: 'En attente de paiement',
  submitted: 'Paiement à vérifier',
  paid: 'Paiement confirmé',
  rejected: 'Paiement refusé',
};

export async function getPaymentMethods(): Promise<PaymentMethodInfo[]> {
  const data = await fetchAPI<{ methods: PaymentMethodInfo[] }>('/payments/methods');
  return data.methods;
}

// `email` : visiteur sans compte (celui saisi à la commande) ; `token` : client connecté
export async function getPaymentStatus(
  orderNumber: string,
  opts: { email?: string; token?: string } = {}
): Promise<PaymentSummary> {
  const params = new URLSearchParams({ orderNumber });
  if (opts.email) params.set('email', opts.email);
  return fetchAPI<PaymentSummary>(`/payments/status?${params.toString()}`, { token: opts.token });
}

export async function submitPayment(
  data: { orderNumber: string; reference: string; payerPhone: string; email?: string },
  token?: string
): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/payments/submit', { method: 'POST', body: JSON.stringify(data), token });
}

// Lance le paiement instantané avec l'opérateur choisi à la commande : envoie la demande sur le téléphone du client
// (MVola, Airtel Money : `payerPhone` requis) ou renvoie la page de paiement d'Orange Money (`attempt.paymentUrl`)
export async function startAutoPayment(
  data: { orderNumber: string; payerPhone?: string; email?: string },
  token?: string
): Promise<{ success: boolean; reused: boolean; attempt: PaymentAttempt; message: string }> {
  return fetchAPI('/payments/auto/initiate', { method: 'POST', body: JSON.stringify(data), token });
}

// Suit une demande : le serveur interroge l'opérateur à chaque appel
export async function getAutoAttempt(
  attemptId: string,
  opts: { email?: string; token?: string } = {}
): Promise<PaymentAttempt> {
  const query = opts.email ? `?email=${encodeURIComponent(opts.email)}` : '';
  return fetchAPI(`/payments/auto/attempt/${encodeURIComponent(attemptId)}${query}`, { token: opts.token });
}

export async function getAdminPayments(
  token: string,
  status: PaymentStatus | 'all' = 'submitted'
): Promise<{ payments: AdminPayment[] }> {
  return fetchAPI(`/payments/admin?status=${status}`, { token });
}

export async function confirmPayment(orderId: string, token: string): Promise<{ success: boolean }> {
  return fetchAPI(`/payments/admin/${orderId}/confirm`, { method: 'PATCH', token });
}

export async function rejectPayment(orderId: string, reason: string, token: string): Promise<{ success: boolean }> {
  return fetchAPI(`/payments/admin/${orderId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    token,
  });
}
