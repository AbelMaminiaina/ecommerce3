import { FetchFn, OperatorError, isHttpUrl, operatorFetch } from './operatorHttp.js';
import { parseRate, type Conversion } from './currency.js';

// Client de l'API Stripe (paiement par carte bancaire) : https://docs.stripe.com/api/checkout/sessions
//
// Comme Orange Money, le client est envoyé sur une page de paiement externe (Stripe Checkout) : il y saisit sa carte,
// Stripe le renvoie sur notre site (`success_url` / `cancel_url`) et peut notifier notre serveur (webhook). Le site
// vérifie ensuite le résultat auprès de Stripe avec la clé secrète : ni le retour du navigateur ni le webhook ne
// suffisent à valider une commande.
//
// Contrat utilisé (API REST, corps en application/x-www-form-urlencoded, authentification Bearer par la clé secrète) :
//   POST {base}/v1/checkout/sessions              -> { id, url, status: open }
//   GET  {base}/v1/checkout/sessions/{id}         -> { status: open|complete|expired, payment_status: paid|unpaid|…, payment_intent }
//   GET  {base}/v1/payment_intents/{id}           -> { status: succeeded, amount_received, currency }
//
// L'Ariary (MGA) est une devise acceptée par Stripe, sans décimales : c'est la devise par défaut. Une autre devise
// (EUR…) demande un taux de conversion (STRIPE_MGA_RATE).

const DEFAULT_BASE_URL = 'https://api.stripe.com';
// Stripe impose une expiration de session entre 30 min et 24 h : la plus courte, plus une marge pour l'horloge
export const STRIPE_SESSION_TTL_S = 31 * 60;

export interface StripeConfig extends Conversion {
  secretKey: string;
  /** Clé de test (sk_test_… / rk_test_…) : aucun débit réel */
  sandbox: boolean;
  baseUrl: string;
}

// Configuration issue de l'environnement ; null tant que la clé secrète (ou le taux, pour une devise autre que MGA) manque
export function getStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const currency = (env.STRIPE_CURRENCY?.trim() || 'MGA').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const rate = parseRate(env.STRIPE_MGA_RATE);
  if (currency !== 'MGA' && !rate) return null;
  return {
    secretKey,
    sandbox: /^(sk|rk)_test_/.test(secretKey),
    baseUrl: (env.STRIPE_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    currency,
    rate,
  };
}

export type StripeStatus = 'pending' | 'completed' | 'failed';

// État d'une session Checkout -> statut du site. Seul « payé » valide ; une session expirée est un échec.
// (Une session « complete » mais « unpaid » correspond à un moyen de paiement différé : on attend.)
export function mapStripeSession(session: { status?: unknown; payment_status?: unknown }): StripeStatus {
  if (session.payment_status === 'paid') return 'completed';
  if (session.status === 'expired') return 'failed';
  return 'pending';
}

// Corps x-www-form-urlencoded à la manière de Stripe (clés imbriquées : line_items[0][price_data][currency])
export function stripeForm(params: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(params).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) return [];
    if (typeof value === 'object') return stripeForm(value as Record<string, unknown>, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`];
  });
}

export class StripeClient {
  constructor(
    private readonly config: StripeConfig,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  private request(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<any> {
    return operatorFetch(
      this.fetchFn,
      `${this.config.baseUrl}/v1${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: params ? stripeForm(params).join('&') : undefined,
      },
      'Stripe'
    );
  }

  // Crée la session de paiement : renvoie l'adresse de la page Stripe où envoyer le client.
  // `reference` (identifiant de la tentative) sert de clé d'idempotence : un nouvel essai ne crée pas deux sessions.
  async createSession(params: {
    reference: string;
    /** Montant en unités mineures de la devise configurée */
    amount: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    if (!Number.isInteger(params.amount) || params.amount <= 0) throw new OperatorError('Montant invalide');

    const data = await this.request(
      'POST',
      '/checkout/sessions',
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: this.config.currency.toLowerCase(),
              unit_amount: params.amount,
              product_data: { name: params.description.slice(0, 250) },
            },
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        client_reference_id: params.reference,
        metadata: { attempt_id: params.reference },
        payment_intent_data: { metadata: { attempt_id: params.reference } },
        expires_at: Math.floor(Date.now() / 1000) + STRIPE_SESSION_TTL_S,
        locale: 'fr',
      },
      `checkout-${params.reference}`
    );

    if (typeof data?.id !== 'string' || !isHttpUrl(data?.url)) {
      throw new OperatorError('Réponse Stripe invalide (page de paiement manquante)');
    }
    return { sessionId: data.id, url: data.url };
  }

  async getSession(sessionId: string): Promise<{ status: StripeStatus; paymentIntentId?: string }> {
    const data = await this.request('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const intent = typeof data?.payment_intent === 'string' ? data.payment_intent : data?.payment_intent?.id;
    return { status: mapStripeSession(data ?? {}), paymentIntentId: typeof intent === 'string' && intent ? intent : undefined };
  }

  // Détail du paiement encaissé (recoupement du montant et de la devise)
  async getPaymentIntent(id: string): Promise<{ succeeded: boolean; amountReceived: number | null; currency: string | null }> {
    const data = await this.request('GET', `/payment_intents/${encodeURIComponent(id)}`);
    return {
      succeeded: data?.status === 'succeeded',
      amountReceived: Number.isInteger(data?.amount_received) ? data.amount_received : null,
      currency: typeof data?.currency === 'string' ? data.currency.toUpperCase() : null,
    };
  }
}

let shared: { key: string; client: StripeClient } | null = null;
export function getStripeClient(): StripeClient | null {
  const config = getStripeConfig();
  if (!config) return null;
  const key = JSON.stringify(config);
  if (!shared || shared.key !== key) shared = { key, client: new StripeClient(config) };
  return shared.client;
}
