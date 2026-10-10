import { FetchFn, OperatorError, isHttpUrl, operatorFetch } from './operatorHttp.js';
import { parseRate, toDecimalString, type Conversion } from './currency.js';

// Client de l'API PayPal « Orders v2 » : https://developer.paypal.com/docs/api/orders/v2/
//
// Le client est envoyé sur la page de PayPal (lien « payer-action ») ; il s'y connecte et APPROUVE le paiement,
// puis PayPal le renvoie sur notre site. Contrairement à Stripe, l'argent n'est encaissé qu'au moment où NOTRE serveur
// « capture » la commande PayPal approuvée : c'est fait lors de la vérification (getStatus), jamais sur la seule foi
// du navigateur ou d'un webhook.
//
// Contrat utilisé :
//   POST {base}/v1/oauth2/token                          OAuth2 client_credentials (Basic)
//   POST {base}/v2/checkout/orders                       -> { id, status: PAYER_ACTION_REQUIRED, links[rel=payer-action] }
//   GET  {base}/v2/checkout/orders/{id}                  -> { status: …|APPROVED|COMPLETED|VOIDED, purchase_units[0].payments.captures }
//   POST {base}/v2/checkout/orders/{id}/capture          -> { status: COMPLETED, purchase_units[0].payments.captures[0] }
//   GET  {base}/v2/payments/captures/{id}                -> { status: COMPLETED, amount: { currency_code, value } }
//
// PayPal n'accepte pas l'Ariary : les montants sont convertis dans PAYPAL_CURRENCY (EUR par défaut) au taux
// PAYPAL_MGA_RATE (Ariary pour 1 unité), arrondis au-dessus.

const BASE_URLS = { sandbox: 'https://api-m.sandbox.paypal.com', production: 'https://api-m.paypal.com' };

export interface PaypalConfig extends Conversion {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  baseUrl: string;
  brandName: string;
}

// Configuration issue de l'environnement ; null tant que les identifiants ou le taux de conversion manquent
export function getPaypalConfig(env: NodeJS.ProcessEnv = process.env): PaypalConfig | null {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  const currency = (env.PAYPAL_CURRENCY?.trim() || 'EUR').toUpperCase();
  const rate = parseRate(env.PAYPAL_MGA_RATE);
  // MGA n'est pas une devise PayPal : un taux vers une devise acceptée est indispensable
  if (!clientId || !clientSecret || !rate || currency === 'MGA' || !/^[A-Z]{3}$/.test(currency)) return null;

  const sandbox = (env.PAYPAL_ENV ?? 'sandbox').trim().toLowerCase() !== 'production';
  return {
    clientId,
    clientSecret,
    sandbox,
    baseUrl: (env.PAYPAL_API_BASE_URL?.trim() || (sandbox ? BASE_URLS.sandbox : BASE_URLS.production)).replace(/\/+$/, ''),
    currency,
    rate,
    brandName: (env.PLATFORM_NAME?.trim() || 'Tsena').slice(0, 127),
  };
}

export type PaypalStatus = 'pending' | 'completed' | 'failed';

export interface PaypalOrderState {
  /** Statut de la commande PayPal (CREATED, PAYER_ACTION_REQUIRED, APPROVED, COMPLETED, VOIDED…) */
  orderStatus: string;
  status: PaypalStatus;
  /** Identifiant de la capture (l'encaissement), une fois la commande capturée */
  captureId?: string;
}

// Commande PayPal -> statut du site. Une commande COMPLETED n'est « payée » que si la capture l'est aussi
// (une capture PENDING, par exemple en cours d'examen chez PayPal, reste en attente).
export function mapPaypalOrder(order: any): PaypalOrderState {
  const orderStatus = typeof order?.status === 'string' ? order.status.toUpperCase() : '';
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = typeof capture?.status === 'string' ? capture.status.toUpperCase() : '';
  const captureId = typeof capture?.id === 'string' && capture.id ? capture.id : undefined;

  if (orderStatus === 'VOIDED') return { orderStatus, status: 'failed' };
  if (orderStatus === 'COMPLETED' || captureStatus) {
    if (captureStatus === 'COMPLETED') return { orderStatus, status: 'completed', captureId };
    if (['DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(captureStatus)) return { orderStatus, status: 'failed', captureId };
    return { orderStatus, status: 'pending', captureId };
  }
  return { orderStatus, status: 'pending' };
}

export class PaypalClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PaypalConfig,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  private async authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const data = await operatorFetch(
      this.fetchFn,
      `${this.config.baseUrl}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      },
      'PayPal'
    );
    const value = typeof data?.access_token === 'string' ? data.access_token : null;
    if (!value) throw new OperatorError('Réponse d’authentification PayPal invalide');
    const expiresIn = Number(data.expires_in);
    this.token = { value, expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000 };
    return value;
  }

  // Appel authentifié ; un jeton refusé (401) est renouvelé une fois. `requestId` rend la requête idempotente chez PayPal.
  private async call(method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.authenticate();
      try {
        return await operatorFetch(
          this.fetchFn,
          `${this.config.baseUrl}${path}`,
          {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          },
          'PayPal'
        );
      } catch (error) {
        if (error instanceof OperatorError && error.status === 401 && attempt === 0) {
          this.token = null;
          continue;
        }
        throw error;
      }
    }
  }

  // Crée la commande PayPal : renvoie l'adresse de la page PayPal où le client approuve le paiement
  async createOrder(params: {
    reference: string;
    /** Montant en unités mineures de la devise configurée */
    amount: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ orderId: string; approveUrl: string }> {
    if (!Number.isInteger(params.amount) || params.amount <= 0) throw new OperatorError('Montant invalide');

    const data = await this.call(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: params.reference.slice(0, 256),
            custom_id: params.reference.slice(0, 127),
            invoice_id: params.reference.slice(0, 127),
            description: params.description.slice(0, 127),
            amount: { currency_code: this.config.currency, value: toDecimalString(params.amount, this.config.currency) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: this.config.brandName,
              locale: 'fr-FR',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: params.returnUrl,
              cancel_url: params.cancelUrl,
            },
          },
        },
      },
      `order-${params.reference}`
    );

    const links: { rel?: string; href?: string }[] = Array.isArray(data?.links) ? data.links : [];
    const approve = links.find((l) => l.rel === 'payer-action') ?? links.find((l) => l.rel === 'approve');
    if (typeof data?.id !== 'string' || !isHttpUrl(approve?.href)) {
      throw new OperatorError('Réponse PayPal invalide (page de paiement manquante)');
    }
    return { orderId: data.id, approveUrl: approve!.href! };
  }

  async getOrder(orderId: string): Promise<PaypalOrderState> {
    return mapPaypalOrder(await this.call('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`));
  }

  // Encaisse une commande approuvée. Idempotent : une capture déjà faite n'est pas refaite.
  // Un refus de PayPal (422 : moyen de paiement refusé…) est relu sur la commande pour ne rien conclure à tort.
  async capture(orderId: string): Promise<PaypalOrderState> {
    try {
      return mapPaypalOrder(await this.call('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`));
    } catch (error) {
      if (!(error instanceof OperatorError) || error.status !== 422) throw error;
      const order = await this.getOrder(orderId);
      // Toujours approuvée après un refus de capture : le moyen de paiement choisi a été refusé
      return order.orderStatus === 'APPROVED' ? { ...order, status: 'failed' } : order;
    }
  }

  // Détail de l'encaissement (recoupement du montant et de la devise)
  async getCapture(captureId: string): Promise<{ completed: boolean; amount: { currency: string; value: string } | null }> {
    const data = await this.call('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
    const amount = data?.amount;
    return {
      completed: typeof data?.status === 'string' && data.status.toUpperCase() === 'COMPLETED',
      amount:
        typeof amount?.currency_code === 'string' && typeof amount?.value === 'string'
          ? { currency: amount.currency_code.toUpperCase(), value: amount.value }
          : null,
    };
  }
}

let shared: { key: string; client: PaypalClient } | null = null;
export function getPaypalClient(): PaypalClient | null {
  const config = getPaypalConfig();
  if (!config) return null;
  const key = JSON.stringify(config);
  if (!shared || shared.key !== key) shared = { key, client: new PaypalClient(config) };
  return shared.client;
}
