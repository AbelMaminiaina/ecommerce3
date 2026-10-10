import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

// Faux serveur PayPal (sous-ensemble Orders v2) : reproduit le contrat utilisé par lib/paypal.ts pour tester
// l'intégration sans compte PayPal. Comme PayPal, il fournit une PAGE où le client APPROUVE le paiement :
//   GET  /pay/:orderId             page où le « client » approuve ou annule
//   POST /pay/:orderId/:outcome     approuve (approve) puis renvoie vers return_url ; annuler renvoie vers cancel_url
// L'argent n'est encaissé qu'à la capture demandée par le serveur du site (POST /v2/checkout/orders/:id/capture).
// Outil de test uniquement : ne jamais l'exposer en production.

interface MockPaypalOrder {
  id: string;
  status: 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED' | 'VOIDED';
  amount: { currency_code: string; value: string };
  customId: string;
  returnUrl: string;
  cancelUrl: string;
  capture?: MockPaypalCapture;
}

interface MockPaypalCapture {
  id: string;
  status: 'COMPLETED' | 'PENDING' | 'DECLINED';
  amount: { currency_code: string; value: string };
  orderId: string;
}

export interface MockPaypalOptions {
  clientId?: string;
  clientSecret?: string;
  recordRequests?: boolean;
  /** Préfixe où l'application est montée (ex. « /api/demo-pay/paypal ») : les liens de la page en tiennent compte */
  mountPath?: string;
  /** L'adresse de la page d'approbation reprend l'origine du `return_url` (le site public) au lieu de l'adresse d'écoute */
  pageOriginFromReturnUrl?: boolean;
}

export interface MockPaypalRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

const paypalError = (res: express.Response, status: number, name: string, message: string, issue?: string) =>
  res.status(status).json({ name, message, details: issue ? [{ issue }] : [] });

export function createMockPaypal(options: MockPaypalOptions = {}) {
  const clientId = options.clientId ?? 'test-client';
  const clientSecret = options.clientSecret ?? 'test-secret';
  const mountPath = (options.mountPath ?? '').replace(/\/+$/, '');
  const requests: MockPaypalRequest[] = [];
  const orders = new Map<string, MockPaypalOrder>();
  const captures = new Map<string, MockPaypalCapture>();
  const requestIds = new Map<string, MockPaypalOrder>();
  const tokens = new Set<string>();
  let tokenCounter = 0;
  let baseUrl = '';
  let captureCount = 0;
  /** Prochaine capture : refusée (carte refusée) ou encaissée pour un autre montant */
  let nextCapture: { decline?: boolean; value?: string } = {};

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    if (options.recordRequests !== false) requests.push({ method: req.method, path: req.path, headers: { ...req.headers }, body: req.body });
    next();
  });

  app.post('/v1/oauth2/token', (req, res) => {
    const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    if (req.headers.authorization !== expected) return res.status(401).json({ error: 'invalid_client', error_description: 'Client Authentication failed' });
    if (req.body?.grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });
    const token = `paypal-token-${++tokenCounter}`;
    tokens.add(token);
    res.json({ token_type: 'Bearer', access_token: token, expires_in: 32400 });
  });

  const requireToken: express.RequestHandler = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || !tokens.has(token)) return paypalError(res, 401, 'AUTHENTICATION_FAILURE', 'Authentication failed due to invalid authentication credentials');
    next();
  };

  function publicOrder(order: MockPaypalOrder) {
    const origin = options.pageOriginFromReturnUrl ? new URL(order.returnUrl).origin + mountPath : baseUrl;
    return {
      id: order.id,
      status: order.status,
      purchase_units: [
        {
          custom_id: order.customId,
          amount: order.amount,
          ...(order.capture ? { payments: { captures: [{ id: order.capture.id, status: order.capture.status, amount: order.capture.amount }] } } : {}),
        },
      ],
      links: [
        { rel: 'self', href: `${baseUrl}/v2/checkout/orders/${order.id}`, method: 'GET' },
        ...(order.status === 'PAYER_ACTION_REQUIRED' ? [{ rel: 'payer-action', href: `${origin}/pay/${order.id}`, method: 'GET' }] : []),
      ],
    };
  }

  app.post('/v2/checkout/orders', requireToken, (req, res) => {
    const requestId = req.headers['paypal-request-id'];
    if (typeof requestId === 'string' && requestIds.has(requestId)) return res.status(200).json(publicOrder(requestIds.get(requestId)!));
    const b = req.body ?? {};
    const unit = b.purchase_units?.[0];
    const context = b.payment_source?.paypal?.experience_context ?? {};
    if (b.intent !== 'CAPTURE') return paypalError(res, 400, 'INVALID_REQUEST', 'Invalid intent');
    if (typeof unit?.amount?.currency_code !== 'string' || unit.amount.currency_code === 'MGA') {
      return paypalError(res, 422, 'UNPROCESSABLE_ENTITY', 'Currency not supported', 'CURRENCY_NOT_SUPPORTED');
    }
    if (typeof unit.amount.value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(unit.amount.value) || Number(unit.amount.value) <= 0) {
      return paypalError(res, 400, 'INVALID_REQUEST', 'Invalid amount value', 'INVALID_PARAMETER_VALUE');
    }
    for (const field of ['return_url', 'cancel_url']) {
      if (typeof context[field] !== 'string' || !/^https?:\/\//.test(context[field])) return paypalError(res, 400, 'INVALID_REQUEST', `Invalid ${field}`);
    }
    const order: MockPaypalOrder = {
      id: randomUUID().replace(/-/g, '').slice(0, 17).toUpperCase(),
      status: 'PAYER_ACTION_REQUIRED',
      amount: { currency_code: unit.amount.currency_code, value: unit.amount.value },
      customId: unit.custom_id ?? '',
      returnUrl: context.return_url,
      cancelUrl: context.cancel_url,
    };
    orders.set(order.id, order);
    if (typeof requestId === 'string') requestIds.set(requestId, order);
    res.status(200).json(publicOrder(order));
  });

  app.get('/v2/checkout/orders/:id', requireToken, (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return paypalError(res, 404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', 'INVALID_RESOURCE_ID');
    res.json(publicOrder(order));
  });

  app.post('/v2/checkout/orders/:id/capture', requireToken, (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return paypalError(res, 404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', 'INVALID_RESOURCE_ID');
    if (order.status === 'COMPLETED') return paypalError(res, 422, 'UNPROCESSABLE_ENTITY', 'Order already captured', 'ORDER_ALREADY_CAPTURED');
    if (order.status !== 'APPROVED') return paypalError(res, 422, 'UNPROCESSABLE_ENTITY', 'Payer has not yet approved the Order', 'ORDER_NOT_APPROVED');
    captureCount++;
    if (nextCapture.decline) {
      nextCapture = {};
      return paypalError(res, 422, 'UNPROCESSABLE_ENTITY', 'The instrument presented was declined', 'INSTRUMENT_DECLINED');
    }
    const capture: MockPaypalCapture = {
      id: randomUUID().replace(/-/g, '').slice(0, 17).toUpperCase(),
      status: 'COMPLETED',
      amount: { currency_code: order.amount.currency_code, value: nextCapture.value ?? order.amount.value },
      orderId: order.id,
    };
    nextCapture = {};
    captures.set(capture.id, capture);
    Object.assign(order, { status: 'COMPLETED', capture });
    res.status(201).json(publicOrder(order));
  });

  app.get('/v2/payments/captures/:id', requireToken, (req, res) => {
    const capture = captures.get(req.params.id);
    if (!capture) return paypalError(res, 404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', 'INVALID_RESOURCE_ID');
    res.json({ id: capture.id, status: capture.status, amount: capture.amount, supplementary_data: { related_ids: { order_id: capture.orderId } } });
  });

  // Le client approuve sur la page PayPal (l'encaissement viendra de la capture)
  function approve(orderId: string) {
    const order = orders.get(orderId);
    if (order && order.status === 'PAYER_ACTION_REQUIRED') order.status = 'APPROVED';
  }

  // --- Page d'approbation PayPal (simulée) ---
  app.get('/pay/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).send('Commande inconnue');
    res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal (simulation)</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<h1 style="color:#003087">PayPal <small style="font-size:14px">(simulation)</small></h1>
<p>Montant : <b id="amount">${order.amount.value}</b> ${order.amount.currency_code}</p>
<form method="post" action="${mountPath}/pay/${order.id}/approve"><button id="pay" style="width:100%;padding:12px;background:#ffc439;color:#111;border:0;font-size:16px">Payer maintenant</button></form>
<form method="post" action="${mountPath}/pay/${order.id}/cancel" style="margin-top:12px"><button id="cancel" style="width:100%;padding:12px;font-size:16px">Annuler et retourner sur le site</button></form>
</body></html>`);
  });

  app.post('/pay/:id/:outcome', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).send('Commande inconnue');
    if (req.params.outcome === 'approve') {
      approve(order.id);
      const back = new URL(order.returnUrl);
      back.searchParams.set('token', order.id);
      back.searchParams.set('PayerID', 'MOCKPAYER');
      return res.redirect(303, back.toString());
    }
    res.redirect(303, order.cancelUrl);
  });

  let server: Server | null = null;
  return {
    app,
    requests,
    orders,
    captures,
    approve,
    /** La prochaine capture est refusée (moyen de paiement refusé) */
    declineNextCapture() {
      nextCapture = { decline: true };
    },
    /** La prochaine capture encaisse un autre montant (simule une fraude ou une erreur) */
    captureNextWithValue(value: string) {
      nextCapture = { value };
    },
    captureCount: () => captureCount,
    revokeTokens() {
      tokens.clear();
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
