import type { Express, Request } from 'express';
import { createMockMvola } from '../testing/mockMvolaServer.js';
import { createMockOrange } from '../testing/mockOrangeServer.js';
import { createMockAirtel } from '../testing/mockAirtelServer.js';
import { createMockStripe } from '../testing/mockStripeServer.js';
import { createMockPaypal } from '../testing/mockPaypalServer.js';

// Paiement de DÉMONSTRATION : quand DEMO_PAYMENTS=true, les faux serveurs MVola, Orange Money, Airtel Money, Stripe et
// PayPal sont montés dans le backend lui-même (sous /api/demo-pay) et le paiement instantané est activé contre eux.
// Les visiteurs de la démo essaient ainsi tout le parcours, sans aucun argent réel ni identifiant de prestataire.
//  - MVola / Airtel : tout numéro valide « confirme » au bout de quelques secondes (…04 = refus, …05 = jamais confirmé) ;
//  - Orange Money, carte bancaire (Stripe), PayPal : le client est redirigé vers une page de paiement simulée.
// Jamais sur un vrai site : le mode refuse de s'activer si des identifiants d'opérateur sont renseignés, et
// l'interface affiche partout un bandeau « Paiement de démonstration ».

export const DEMO_PATH = '/api/demo-pay';

let active = false;
export const isDemoPayments = (): boolean => active;

const REAL_CREDENTIALS = ['MVOLA_CONSUMER_KEY', 'ORANGE_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_ID', 'STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_ID'];
const DEMO_NUMBERS: Record<string, string> = {
  PAYMENT_MVOLA_NUMBER: '034 00 000 00',
  PAYMENT_ORANGE_MONEY_NUMBER: '032 00 000 00',
  PAYMENT_AIRTEL_MONEY_NUMBER: '033 00 000 00',
};

// Active le mode démo sur l'application (déjà à l'écoute sur `port`). Renvoie true si le mode est actif.
export function setupDemoPayments(app: Express, port: number, env: NodeJS.ProcessEnv = process.env): boolean {
  active = false;
  if (env.DEMO_PAYMENTS !== 'true') return false;

  const real = REAL_CREDENTIALS.filter((key) => env[key]?.trim());
  if (real.length > 0) {
    console.error(`DEMO_PAYMENTS ignoré : des identifiants réels sont configurés (${real.join(', ')}). Le paiement de démonstration ne doit jamais coexister avec de vrais identifiants.`);
    return false;
  }

  const delay = Number(env.DEMO_PAYMENTS_DELAY_MS ?? 4000);
  const internal = `http://127.0.0.1:${port}${DEMO_PATH}`;

  app.use(`${DEMO_PATH}/mvola`, createMockMvola({ consumerKey: 'demo-key', consumerSecret: 'demo-secret', autoResolveMs: delay, recordRequests: false }).app);
  app.use(`${DEMO_PATH}/airtel`, createMockAirtel({ clientId: 'demo-client', clientSecret: 'demo-secret', autoResolveMs: delay, recordRequests: false }).app);
  app.use(
    `${DEMO_PATH}/orange`,
    createMockOrange({
      clientId: 'demo-client',
      clientSecret: 'demo-secret',
      merchantKey: 'demo-merchant',
      recordRequests: false,
      mountPath: `${DEMO_PATH}/orange`,
      pageOriginFromReturnUrl: true,
    }).app
  );

  app.use(
    `${DEMO_PATH}/stripe`,
    createMockStripe({ secretKey: 'sk_test_demo', recordRequests: false, mountPath: `${DEMO_PATH}/stripe`, pageOriginFromReturnUrl: true }).app
  );
  app.use(
    `${DEMO_PATH}/paypal`,
    createMockPaypal({
      clientId: 'demo-client',
      clientSecret: 'demo-secret',
      recordRequests: false,
      mountPath: `${DEMO_PATH}/paypal`,
      pageOriginFromReturnUrl: true,
    }).app
  );

  Object.assign(env, {
    MVOLA_CONSUMER_KEY: 'demo-key',
    MVOLA_CONSUMER_SECRET: 'demo-secret',
    MVOLA_MERCHANT_NUMBER: '034 00 000 00',
    MVOLA_API_BASE_URL: `${internal}/mvola`,
    ORANGE_MONEY_CLIENT_ID: 'demo-client',
    ORANGE_MONEY_CLIENT_SECRET: 'demo-secret',
    ORANGE_MONEY_MERCHANT_KEY: 'demo-merchant',
    ORANGE_MONEY_API_BASE_URL: `${internal}/orange`,
    ORANGE_MONEY_NOTIF_URL: `http://127.0.0.1:${port}/api/payments/auto/callback/orange_money`,
    AIRTEL_MONEY_CLIENT_ID: 'demo-client',
    AIRTEL_MONEY_CLIENT_SECRET: 'demo-secret',
    AIRTEL_MONEY_API_BASE_URL: `${internal}/airtel`,
    STRIPE_SECRET_KEY: 'sk_test_demo',
    STRIPE_API_BASE_URL: `${internal}/stripe`,
    PAYPAL_CLIENT_ID: 'demo-client',
    PAYPAL_CLIENT_SECRET: 'demo-secret',
    PAYPAL_API_BASE_URL: `${internal}/paypal`,
  });
  // PayPal n'accepte pas l'Ariary : taux de démonstration si aucun n'est configuré
  if (!env.PAYPAL_MGA_RATE?.trim()) env.PAYPAL_MGA_RATE = '5000';
  // Sans adresse publique, Orange Money resterait désactivé : le retour du client se règle à chaque demande (voir requestOrigin)
  if (!env.PUBLIC_SITE_URL?.trim() && !env.FRONTEND_URL?.trim()) env.PUBLIC_SITE_URL = 'http://localhost:3000';
  // Un moyen de paiement n'est proposé que si son numéro marchand est renseigné : numéros de démonstration par défaut
  for (const [key, value] of Object.entries(DEMO_NUMBERS)) if (!env[key]?.trim()) env[key] = value;

  console.warn('⚠️  PAIEMENT DE DÉMONSTRATION ACTIVÉ : MVola, Orange Money, Airtel Money, Stripe et PayPal sont SIMULÉS, aucun argent réel. Ne jamais activer sur un vrai site.');
  active = true;
  return true;
}

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Adresse publique du site telle que le navigateur du visiteur la voit : en-tête Origin (posé par les navigateurs sur
// les requêtes POST, y compris quand le site et l'API sont sur des ports différents), sinon en-têtes de nginx.
// Utilisée en mode démo pour ramener le client depuis la page de paiement simulée, même quand l'adresse change (tunnel
// trycloudflare). Ne sert que la démo : en production l'adresse vient de la configuration, jamais d'un en-tête.
export function requestOrigin(req: Request): string | undefined {
  if (!active) return undefined;
  const origin = req.get('origin');
  if (origin) {
    try {
      const url = new URL(origin);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && HOST_PATTERN.test(url.host) && url.origin === origin) return url.origin;
    } catch {
      // Origin illisible : repli sur les en-têtes de nginx
    }
  }
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim();
  if (!HOST_PATTERN.test(host)) return undefined;
  const proto = (req.get('x-forwarded-proto') ?? req.protocol ?? 'http').split(',')[0].trim();
  return proto === 'https' || proto === 'http' ? `${proto}://${host}` : undefined;
}
