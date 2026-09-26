import { randomUUID } from 'node:crypto';
import { isMvolaNumber, normalizeMalagasyMobile } from './phone.js';
import { type FetchFn, OperatorError, operatorFetch } from './operatorHttp.js';

// Client de l'API « Merchant Pay » de MVola (Telma) : le site demande le paiement, le client confirme sur son
// téléphone (notification + code secret), puis le site interroge MVola pour connaître le résultat.
//
// Contrat implémenté (documentation MVola / portail développeurs https://www.mvola.mg/devportal) :
//   POST {base}/token                                             OAuth2 client_credentials, scope EXT_INT_MVOLA_SCOPE
//   POST {base}/mvola/mm/transactions/type/merchantpay/1.0.0/     initier le paiement  -> { status, serverCorrelationId, objectReference }
//   GET  {base}/mvola/mm/transactions/type/merchantpay/1.0.0/status/{serverCorrelationId}  -> { status: pending|completed|failed }
//   GET  {base}/mvola/mm/transactions/type/merchantpay/1.0.0/{objectReference}             détails (montant, numéros)
//   base : https://devapi.mvola.mg (bac à sable) ou https://api.mvola.mg (production)
//
// À VALIDER avec vos identifiants dans le bac à sable de MVola (voir MVOLA-INTEGRATION.md) : les noms de champs
// exacts et le comportement des cas d'erreur n'ont pu être confrontés qu'à un faux serveur qui reproduit ce contrat.

const SANDBOX_URL = 'https://devapi.mvola.mg';
const PRODUCTION_URL = 'https://api.mvola.mg';
const MERCHANT_PAY_PATH = '/mvola/mm/transactions/type/merchantpay/1.0.0';

export interface MvolaConfig {
  consumerKey: string;
  consumerSecret: string;
  /** Numéro MVola du compte marchand qui reçoit l'argent, au format local (034…) */
  merchantNumber: string;
  /** Nom du partenaire enregistré chez MVola */
  partnerName: string;
  baseUrl: string;
  sandbox: boolean;
  /** Langue des messages envoyés au client par MVola */
  language: 'FR' | 'MG';
  /** URL publique (HTTPS) où MVola notifie le résultat ; facultative : le site interroge aussi MVola lui-même */
  callbackUrl?: string;
}

// Configuration issue de l'environnement ; null tant que les identifiants ne sont pas renseignés
// (le paiement manuel par référence reste alors le seul mode proposé).
export function getMvolaConfig(env: NodeJS.ProcessEnv = process.env): MvolaConfig | null {
  const consumerKey = env.MVOLA_CONSUMER_KEY?.trim();
  const consumerSecret = env.MVOLA_CONSUMER_SECRET?.trim();
  const merchant = env.MVOLA_MERCHANT_NUMBER ? normalizeMalagasyMobile(env.MVOLA_MERCHANT_NUMBER) : null;
  if (!consumerKey || !consumerSecret || !merchant) return null;

  const sandbox = (env.MVOLA_ENV ?? 'sandbox').trim().toLowerCase() !== 'production';
  return {
    consumerKey,
    consumerSecret,
    merchantNumber: merchant,
    partnerName: env.MVOLA_PARTNER_NAME?.trim() || env.PLATFORM_NAME?.trim() || 'Tsena Pro',
    baseUrl: (env.MVOLA_API_BASE_URL?.trim() || (sandbox ? SANDBOX_URL : PRODUCTION_URL)).replace(/\/+$/, ''),
    sandbox,
    language: env.MVOLA_LANGUAGE?.trim().toUpperCase() === 'MG' ? 'MG' : 'FR',
    callbackUrl: env.MVOLA_CALLBACK_URL?.trim() || undefined,
  };
}

export type MvolaStatus = 'pending' | 'completed' | 'failed';

// Statuts MVola -> statuts du site. Tout statut inconnu reste « pending » (on ne valide jamais sur une supposition).
export function mapMvolaStatus(status: unknown): MvolaStatus {
  switch (typeof status === 'string' ? status.toLowerCase() : '') {
    case 'completed':
    case 'success':
    case 'successful':
      return 'completed';
    case 'failed':
    case 'rejected':
    case 'cancelled':
    case 'canceled':
    case 'expired':
    case 'declined':
      return 'failed';
    default:
      return 'pending';
  }
}

export class MvolaError extends OperatorError {
  constructor(message: string, status?: number, retriable = false) {
    super(message, status, retriable);
    this.name = 'MvolaError';
  }
}

export interface MvolaInitiateResult {
  status: MvolaStatus;
  serverCorrelationId: string;
  objectReference?: string;
  notificationMethod?: string;
}

export interface MvolaTransaction {
  amount: number;
  currency: string;
  status: MvolaStatus;
  debitMsisdn?: string;
  creditMsisdn?: string;
  reference?: string;
}

export class MvolaClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: MvolaConfig,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  private async authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
    const data = await this.send('POST', '/token', {
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: 'grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE',
    });
    const value = typeof data?.access_token === 'string' ? data.access_token : null;
    if (!value) throw new MvolaError('Réponse d’authentification MVola invalide');
    const expiresIn = Number(data.expires_in);
    this.token = { value, expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000 };
    return value;
  }

  // Envoi HTTP via la brique commune des opérateurs ; toute erreur devient une MvolaError
  private async send(method: 'GET' | 'POST', path: string, init: { headers?: Record<string, string>; body?: string }): Promise<any> {
    try {
      return await operatorFetch(this.fetchFn, `${this.config.baseUrl}${path}`, { method, ...init }, 'MVola');
    } catch (error) {
      if (error instanceof OperatorError) throw new MvolaError(error.message, error.status, error.retriable);
      throw error;
    }
  }

  // Appel authentifié ; un jeton refusé (401) est renouvelé une fois
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.authenticate();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Version: '1.0',
        'X-CorrelationID': randomUUID(),
        UserLanguage: this.config.language,
        UserAccountIdentifier: `msisdn;${this.config.merchantNumber}`,
        partnerName: this.config.partnerName,
        'Cache-Control': 'no-cache',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (method === 'POST' && this.config.callbackUrl) headers['X-Callback-URL'] = this.config.callbackUrl;

      try {
        return await this.send(method, path, { headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (error) {
        if (error instanceof MvolaError && error.status === 401 && attempt === 0) {
          this.token = null;
          continue;
        }
        throw error;
      }
    }
  }

  // Demande de paiement : MVola envoie une notification au téléphone du client (débiteur)
  async initiate(params: { amount: number; reference: string; description: string; payerNumber: string }): Promise<MvolaInitiateResult> {
    const payer = normalizeMalagasyMobile(params.payerNumber);
    if (!payer || !isMvolaNumber(payer)) throw new MvolaError('Numéro MVola invalide (034 ou 038)');
    if (!Number.isInteger(params.amount) || params.amount <= 0) throw new MvolaError('Montant invalide');

    const data = await this.call('POST', `${MERCHANT_PAY_PATH}/`, {
      amount: String(params.amount),
      currency: 'Ar',
      descriptionText: params.description.slice(0, 40),
      requestingOrganisationTransactionReference: params.reference,
      requestDate: new Date().toISOString(),
      originalTransactionReference: params.reference,
      debitParty: [{ key: 'msisdn', value: payer }],
      creditParty: [{ key: 'msisdn', value: this.config.merchantNumber }],
      metadata: [
        { key: 'partnerName', value: this.config.partnerName },
        // Champs de devise étrangère exigés par la documentation MVola (valeurs indicatives, sans effet sur le montant en Ar)
        { key: 'fc', value: 'USD' },
        { key: 'amountFc', value: '1' },
      ],
    });

    const serverCorrelationId = typeof data?.serverCorrelationId === 'string' ? data.serverCorrelationId : null;
    if (!serverCorrelationId) throw new MvolaError('Réponse MVola invalide (identifiant de suivi manquant)');
    return {
      status: mapMvolaStatus(data.status),
      serverCorrelationId,
      objectReference: typeof data.objectReference === 'string' ? data.objectReference : undefined,
      notificationMethod: typeof data.notificationMethod === 'string' ? data.notificationMethod : undefined,
    };
  }

  // État d'une demande de paiement (pending tant que le client n'a pas confirmé)
  async getStatus(serverCorrelationId: string): Promise<{ status: MvolaStatus; objectReference?: string }> {
    const data = await this.call('GET', `${MERCHANT_PAY_PATH}/status/${encodeURIComponent(serverCorrelationId)}`);
    return {
      status: mapMvolaStatus(data?.status),
      objectReference: typeof data?.objectReference === 'string' ? data.objectReference : undefined,
    };
  }

  // Détails d'une transaction terminée : sert à recouper le montant et le compte crédité
  async getTransaction(transactionId: string): Promise<MvolaTransaction> {
    const data = await this.call('GET', `${MERCHANT_PAY_PATH}/${encodeURIComponent(transactionId)}`);
    const party = (list: unknown): string | undefined => {
      const entry = Array.isArray(list) ? list.find((p) => p?.key === 'msisdn') : undefined;
      return typeof entry?.value === 'string' ? entry.value : undefined;
    };
    return {
      amount: Number.parseFloat(data?.amount),
      currency: typeof data?.currency === 'string' ? data.currency : 'Ar',
      status: mapMvolaStatus(data?.transactionStatus ?? data?.status),
      debitMsisdn: party(data?.debitParty),
      creditMsisdn: party(data?.creditParty),
      reference: typeof data?.requestingOrganisationTransactionReference === 'string' ? data.requestingOrganisationTransactionReference : undefined,
    };
  }
}

// Client partagé (jeton mis en cache) tant que la configuration ne change pas ; null si MVola n'est pas configuré
let shared: { key: string; client: MvolaClient } | null = null;
export function getMvolaClient(): MvolaClient | null {
  const config = getMvolaConfig();
  if (!config) return null;
  const key = JSON.stringify(config);
  if (!shared || shared.key !== key) shared = { key, client: new MvolaClient(config) };
  return shared.client;
}
