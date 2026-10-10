import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

// Faux serveur Stripe (sous-ensemble Checkout) : reproduit le contrat utilisé par lib/stripe.ts pour tester
// l'intégration sans compte Stripe. Comme Stripe Checkout, il fournit une PAGE DE PAIEMENT (`url`) :
//   GET  /pay/:sessionId           page où le « client » paie ou annule
//   POST /pay/:sessionId/:outcome   paie (success) puis renvoie vers success_url ; annuler renvoie vers cancel_url
//                                   en laissant la session ouverte (comme Stripe)
// puis envoie un webhook `checkout.session.completed` (non signé ici) à `webhookUrl` s'il est fourni.
// Outil de test uniquement : ne jamais l'exposer en production.

interface MockStripeSession {
  id: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'unpaid' | 'paid';
  amount_total: number;
  currency: string;
  success_url: string;
  cancel_url: string;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  payment_intent: string | null;
}

interface MockPaymentIntent {
  id: string;
  status: 'succeeded';
  amount: number;
  amount_received: number;
  currency: string;
}

export interface MockStripeOptions {
  secretKey?: string;
  /** Adresse où envoyer le webhook de fin de paiement (facultatif) */
  webhookUrl?: string;
  recordRequests?: boolean;
  /** Préfixe où l'application est montée (ex. « /api/demo-pay/stripe ») : les liens de la page en tiennent compte */
  mountPath?: string;
  /** L'adresse de la page de paiement reprend l'origine du `success_url` (le site public) au lieu de l'adresse d'écoute */
  pageOriginFromReturnUrl?: boolean;
}

export interface MockStripeRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

const stripeError = (res: express.Response, status: number, message: string, type = 'invalid_request_error') =>
  res.status(status).json({ error: { type, message } });

export function createMockStripe(options: MockStripeOptions = {}) {
  const secretKey = options.secretKey ?? 'sk_test_mock';
  const mountPath = (options.mountPath ?? '').replace(/\/+$/, '');
  const requests: MockStripeRequest[] = [];
  const sessions = new Map<string, MockStripeSession>();
  const intents = new Map<string, MockPaymentIntent>();
  const idempotency = new Map<string, MockStripeSession>();
  let baseUrl = '';
  let failNextSession = false;

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    if (options.recordRequests !== false) requests.push({ method: req.method, path: req.path, headers: { ...req.headers }, body: req.body });
    next();
  });

  const requireKey: express.RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${secretKey}`) return stripeError(res, 401, 'Invalid API Key provided', 'authentication_error');
    next();
  };

  app.post('/v1/checkout/sessions', requireKey, (req, res) => {
    const key = req.headers['idempotency-key'];
    if (typeof key === 'string' && idempotency.has(key)) return res.json(publicSession(idempotency.get(key)!));
    if (failNextSession) {
      failNextSession = false;
      return stripeError(res, 500, 'Internal error', 'api_error');
    }
    const b = req.body ?? {};
    const item = b.line_items?.[0];
    const amount = Number(item?.price_data?.unit_amount);
    const currency = item?.price_data?.currency;
    if (b.mode !== 'payment') return stripeError(res, 400, 'Invalid mode');
    if (!Number.isInteger(amount) || amount <= 0) return stripeError(res, 400, 'Invalid unit_amount');
    if (typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency)) return stripeError(res, 400, 'Invalid currency');
    for (const field of ['success_url', 'cancel_url']) {
      if (typeof b[field] !== 'string' || !/^https?:\/\//.test(b[field])) return stripeError(res, 400, `Invalid ${field}`);
    }
    const expiresAt = Number(b.expires_at);
    const now = Math.floor(Date.now() / 1000);
    if (b.expires_at !== undefined && (expiresAt < now + 30 * 60 || expiresAt > now + 24 * 3600)) {
      return stripeError(res, 400, 'expires_at must be between 30 minutes and 24 hours from now');
    }

    const session: MockStripeSession = {
      id: `cs_test_${randomUUID().replace(/-/g, '')}`,
      status: 'open',
      payment_status: 'unpaid',
      amount_total: amount * Number(item.quantity ?? 1),
      currency,
      success_url: b.success_url,
      cancel_url: b.cancel_url,
      client_reference_id: b.client_reference_id ?? null,
      metadata: b.metadata ?? {},
      payment_intent: null,
    };
    sessions.set(session.id, session);
    if (typeof key === 'string') idempotency.set(key, session);
    res.json(publicSession(session));
  });

  function publicSession(session: MockStripeSession) {
    const origin = options.pageOriginFromReturnUrl ? new URL(session.success_url).origin + mountPath : baseUrl;
    return { object: 'checkout.session', ...session, url: session.status === 'open' ? `${origin}/pay/${session.id}` : null };
  }

  app.get('/v1/checkout/sessions/:id', requireKey, (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return stripeError(res, 404, `No such checkout.session: '${req.params.id}'`);
    res.json(publicSession(session));
  });

  app.get('/v1/payment_intents/:id', requireKey, (req, res) => {
    const intent = intents.get(req.params.id);
    if (!intent) return stripeError(res, 404, `No such payment_intent: '${req.params.id}'`);
    res.json({ object: 'payment_intent', ...intent });
  });

  // Le client paie sur la page Stripe ; `paidAmount` simule un encaissement différent du montant demandé
  function pay(sessionId: string, paidAmount?: number) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') return;
    const intent: MockPaymentIntent = {
      id: `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      status: 'succeeded',
      amount: session.amount_total,
      amount_received: paidAmount ?? session.amount_total,
      currency: session.currency,
    };
    intents.set(intent.id, intent);
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: intent.id });
    if (options.webhookUrl) {
      fetch(options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'checkout.session.completed', data: { object: publicSession(session) } }),
      }).catch(() => undefined);
    }
  }

  function expire(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session && session.status === 'open') session.status = 'expired';
  }

  // --- Page de paiement Stripe Checkout (simulée) ---
  app.get('/pay/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).send('Session inconnue');
    if (session.status !== 'open') return res.status(410).send('Session terminée');
    res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stripe (simulation)</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<h1 style="color:#635bff">Stripe <small style="font-size:14px">(simulation)</small></h1>
<p>Montant : <b id="amount">${session.amount_total}</b> ${session.currency.toUpperCase()}</p>
<p style="color:#666">Carte de test : 4242 4242 4242 4242 (aucune saisie nécessaire ici)</p>
<form method="post" action="${mountPath}/pay/${session.id}/success"><button id="pay" style="width:100%;padding:12px;background:#635bff;color:#fff;border:0;font-size:16px">Payer</button></form>
<form method="post" action="${mountPath}/pay/${session.id}/cancel" style="margin-top:12px"><button id="cancel" style="width:100%;padding:12px;font-size:16px">Retour au site</button></form>
</body></html>`);
  });

  app.post('/pay/:id/:outcome', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).send('Session inconnue');
    const success = req.params.outcome === 'success';
    if (success) pay(session.id);
    res.redirect(303, success ? session.success_url : session.cancel_url);
  });

  let server: Server | null = null;
  return {
    app,
    requests,
    sessions,
    intents,
    /** Simule le paiement fait par le client sur la page Stripe (montant encaissé différent avec `paidAmount`) */
    pay,
    /** Simule l'expiration de la session */
    expire,
    /** Fait échouer (HTTP 500) la prochaine création de session */
    failNextSession() {
      failNextSession = true;
    },
    async listen(port = 0): Promise<{ url: string; port: number }> {
      await new Promise<void>((done) => {
        server = app.listen(port, '127.0.0.1', () => done());
      });
      const actual = (server!.address() as { port: number }).port;
      baseUrl = `http://127.0.0.1:${actual}`;
      return { url: baseUrl, port: actual };
    },
    async close(): Promise<void> {
      await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    },
  };
}
