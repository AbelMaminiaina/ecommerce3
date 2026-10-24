import { FetchFn, OperatorError, operatorFetch } from './operatorHttp.js';
import { normalizeMalagasyMobile } from './phone.js';

// Envoi de SMS (codes de connexion, suivi des commandes). Prestataire choisi par SMS_PROVIDER :
//   orange : API « SMS Madagascar » d'Orange Developer (https://developer.orange.com/apis/sms-mg)
//            POST {base}/oauth/v3/token                                   OAuth2 client_credentials (Basic)
//            POST {base}/smsmessaging/v1/outbound/{expéditeur}/requests   { outboundSMSMessageRequest: … }
//            Le forfait SMS s'achète sur le portail Orange Developer ; il couvre tous les opérateurs malgaches.
//   twilio : API Messages de Twilio (https://www.twilio.com/docs/messaging/api/message-resource)
//   demo   : rien n'est envoyé, le texte est écrit dans les logs et le code de connexion est renvoyé au site
//            (démonstration et développement uniquement : n'importe qui pourrait se connecter à n'importe quel numéro)
// Sans SMS_PROVIDER : « demo » hors production, aucun SMS en production.
//
// À VALIDER avec vos identifiants Orange : l'adresse d'expéditeur de Madagascar (ORANGE_SMS_SENDER) et le nom
// d'expéditeur (senderName, à faire enregistrer auprès d'Orange) n'ont été confrontés qu'aux tests.

export type SmsProvider = 'orange' | 'twilio' | 'demo';

const DEFAULT_ORANGE_BASE_URL = 'https://api.orange.com';
const DEFAULT_TWILIO_BASE_URL = 'https://api.twilio.com';

export interface SmsConfig {
  provider: SmsProvider;
  orange?: { clientId: string; clientSecret: string; sender: string; senderName?: string; baseUrl: string };
  twilio?: { accountSid: string; authToken: string; from: string; baseUrl: string };
}

// Configuration issue de l'environnement ; null si aucun SMS ne peut être envoyé
export function getSmsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig | null {
  const provider = env.SMS_PROVIDER?.trim().toLowerCase() || (env.NODE_ENV === 'production' ? '' : 'demo');

  if (provider === 'demo') return { provider };

  if (provider === 'orange') {
    const clientId = env.ORANGE_SMS_CLIENT_ID?.trim();
    const clientSecret = env.ORANGE_SMS_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return {
      provider,
      orange: {
        clientId,
        clientSecret,
        sender: env.ORANGE_SMS_SENDER?.trim() || 'tel:+2610000',
        senderName: env.ORANGE_SMS_SENDER_NAME?.trim() || undefined,
        baseUrl: (env.ORANGE_SMS_API_BASE_URL?.trim() || DEFAULT_ORANGE_BASE_URL).replace(/\/+$/, ''),
      },
    };
  }

  if (provider === 'twilio') {
    const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = env.TWILIO_AUTH_TOKEN?.trim();
    const from = env.TWILIO_FROM?.trim();
    if (!accountSid || !authToken || !from) return null;
    return {
      provider,
      twilio: {
        accountSid,
        authToken,
        from,
        baseUrl: (env.TWILIO_API_BASE_URL?.trim() || DEFAULT_TWILIO_BASE_URL).replace(/\/+$/, ''),
      },
    };
  }

  return null;
}

export function smsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSmsConfig(env) !== null;
}

// Mode démonstration : le code de connexion est affiché sur le site au lieu d'être envoyé
export function isDemoSms(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSmsConfig(env)?.provider === 'demo';
}

// « 0341234567 » -> « +261341234567 »
export function toInternational(localNumber: string): string {
  return `+261${localNumber.slice(1)}`;
}

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

// Jeton OAuth d'Orange, réutilisé jusqu'à une minute avant son expiration
let orangeToken: { value: string; expiresAt: number; clientId: string } | null = null;

export function resetSmsTokenCache(): void {
  orangeToken = null;
}

async function orangeAccessToken(config: NonNullable<SmsConfig['orange']>, fetchFn: FetchFn): Promise<string> {
  if (orangeToken && orangeToken.clientId === config.clientId && orangeToken.expiresAt > Date.now()) {
    return orangeToken.value;
  }
  const data = await operatorFetch(
    fetchFn,
    `${config.baseUrl}/oauth/v3/token`,
    {
      method: 'POST',
      headers: {
        Authorization: basic(config.clientId, config.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    },
    'Orange SMS'
  );
  if (typeof data?.access_token !== 'string') throw new OperatorError("Orange SMS n'a pas renvoyé de jeton");
  const ttlSeconds = Number(data.expires_in) || 3600;
  orangeToken = { value: data.access_token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000, clientId: config.clientId };
  return orangeToken.value;
}

async function sendWithOrange(config: NonNullable<SmsConfig['orange']>, to: string, text: string, fetchFn: FetchFn) {
  const token = await orangeAccessToken(config, fetchFn);
  await operatorFetch(
    fetchFn,
    `${config.baseUrl}/smsmessaging/v1/outbound/${encodeURIComponent(config.sender)}/requests`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${to}`,
          senderAddress: config.sender,
          ...(config.senderName ? { senderName: config.senderName } : {}),
          outboundSMSTextMessage: { message: text },
        },
      }),
    },
    'Orange SMS'
  );
}

async function sendWithTwilio(config: NonNullable<SmsConfig['twilio']>, to: string, text: string, fetchFn: FetchFn) {
  await operatorFetch(
    fetchFn,
    `${config.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: basic(config.accountSid, config.authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: config.from, Body: text }).toString(),
    },
    'Twilio'
  );
}

/**
 * Envoie un SMS à un mobile malgache. Renvoie false sans rien envoyer si les SMS ne sont pas configurés ou si le
 * numéro n'est pas un mobile malgache ; lève une OperatorError si le prestataire refuse l'envoi.
 */
export async function sendSms(
  phone: string,
  text: string,
  { env = process.env, fetchFn = fetch }: { env?: NodeJS.ProcessEnv; fetchFn?: FetchFn } = {}
): Promise<boolean> {
  const config = getSmsConfig(env);
  const local = normalizeMalagasyMobile(phone);
  if (!config || !local) return false;
  const to = toInternational(local);

  if (config.provider === 'demo') {
    console.log(`[SMS démo] à ${to} : ${text}`);
    return true;
  }
  if (config.provider === 'orange') await sendWithOrange(config.orange!, to, text, fetchFn);
  else await sendWithTwilio(config.twilio!, to, text, fetchFn);
  console.log(`SMS envoyé à ${to.slice(0, 7)}…`);
  return true;
}
