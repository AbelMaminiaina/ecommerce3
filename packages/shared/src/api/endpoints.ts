// Appels de l'API utilisés par l'application (et réutilisables par le site). Chaque fonction reçoit le client.

import type { ApiClient } from './client';
import type {
  Category,
  CheckoutInput,
  CheckoutResponse,
  LoginResponse,
  MeResponse,
  Order,
  PaymentAttempt,
  PaymentMethodInfo,
  PaymentSummary,
  Product,
  ProductPage,
  ProductReviews,
  Session,
} from '../types';
import type { LoginInput, RegisterCustomerInput } from '../schemas';

const enc = encodeURIComponent;

function query(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${enc(k)}=${enc(String(v))}`).join('&');
}

// ---------- Comptes ----------

export const authApi = {
  /** `client: 'mobile'` : jeton d'accès court, renouvelé automatiquement (le site garde un jeton de 7 jours) */
  login: (api: ApiClient, data: LoginInput, client?: 'mobile') =>
    api.request<LoginResponse>('/auth/login', { method: 'POST', body: client ? { ...data, client } : data, auth: false }),

  register: (api: ApiClient, data: RegisterCustomerInput) =>
    api.request<{ success: boolean; message: string; userId: string }>('/auth/register', {
      method: 'POST',
      body: data,
      auth: false,
    }),

  me: (api: ApiClient) => api.request<MeResponse>('/auth/me'),

  /** Ferme la session de cet appareil (le jeton de renouvellement est révoqué) */
  logout: (api: ApiClient, session: Session) =>
    api.request<void>('/auth/logout', { method: 'POST', body: { refreshToken: session.refreshToken }, auth: false }),

  /** Suppression définitive du compte (exigée par Apple et Google) */
  deleteAccount: (api: ApiClient, password: string) =>
    api.request<void>('/auth/me', { method: 'DELETE', body: { password } }),
};

// ---------- Catalogue ----------

export interface ProductQuery {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  inStock?: boolean;
  seller?: string;
}

export const catalogApi = {
  /** Une page du catalogue (pagination obligatoire côté mobile) */
  products: (api: ApiClient, { page = 1, limit = 20, ...filters }: ProductQuery = {}, signal?: AbortSignal) =>
    api.request<ProductPage>(`/products${query({ page, limit, ...filters })}`, { auth: false, signal }),

  product: (api: ApiClient, slug: string) => api.request<Product>(`/products/${enc(slug)}`, { auth: false }),

  reviews: (api: ApiClient, slug: string) =>
    api.request<ProductReviews>(`/products/${enc(slug)}/reviews`, { auth: false }),

  categories: async (api: ApiClient) => {
    const { categories } = await api.request<{ categories: Category[] }>('/categories', { auth: false });
    return categories.filter((c) => c.isActive).sort((a, b) => a.order - b.order);
  },
};

// ---------- Commandes ----------

export const ordersApi = {
  /** Sans session : commande sans compte (coordonnées dans `data.guest`) */
  create: (api: ApiClient, data: CheckoutInput) =>
    api.request<CheckoutResponse>('/checkout', { method: 'POST', body: data }),

  mine: async (api: ApiClient) => (await api.request<{ orders: Order[] }>('/checkout/orders/mine')).orders,

};

// ---------- Paiement ----------

export const paymentsApi = {
  methods: async (api: ApiClient) =>
    (await api.request<{ methods: PaymentMethodInfo[] }>('/payments/methods', { auth: false })).methods,

  /** `email` : commande sans compte */
  status: (api: ApiClient, orderNumber: string, email?: string) =>
    api.request<PaymentSummary>(`/payments/status${query({ orderNumber, email })}`),

  /** Paiement instantané : demande sur le téléphone (MVola, Airtel) ou page de l'opérateur (Orange Money) */
  startAuto: (api: ApiClient, data: { orderNumber: string; payerPhone?: string; email?: string }) =>
    api.request<{ success: boolean; reused: boolean; attempt: PaymentAttempt; message: string }>(
      '/payments/auto/initiate',
      { method: 'POST', body: data }
    ),

  attempt: (api: ApiClient, attemptId: string, email?: string) =>
    api.request<PaymentAttempt>(`/payments/auto/attempt/${enc(attemptId)}${query({ email })}`),

  /** Paiement manuel : référence de la transaction envoyée au numéro marchand */
  submitReference: (api: ApiClient, data: { orderNumber: string; reference: string; payerPhone: string; email?: string }) =>
    api.request<{ success: boolean; message: string }>('/payments/submit', { method: 'POST', body: data }),
};
