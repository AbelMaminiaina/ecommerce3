import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { DEMO_PATH, isDemoPayments, requestOrigin, setupDemoPayments } from './demoPayments.js';
import { getMvolaClient } from '../lib/mvola.js';
import { getOrangeClient } from '../lib/orangeMoney.js';
import { getAirtelClient } from '../lib/airtelMoney.js';
import { getStripeClient } from '../lib/stripe.js';
import { getPaypalClient } from '../lib/paypal.js';
import { getAutomaticOperator } from '../lib/operators.js';
import { getPaymentMethods } from '../lib/payments.js';

const KEYS = [
  'DEMO_PAYMENTS', 'DEMO_PAYMENTS_DELAY_MS', 'PUBLIC_SITE_URL', 'FRONTEND_URL',
  'MVOLA_CONSUMER_KEY', 'MVOLA_CONSUMER_SECRET', 'MVOLA_MERCHANT_NUMBER', 'MVOLA_API_BASE_URL',
  'ORANGE_MONEY_CLIENT_ID', 'ORANGE_MONEY_CLIENT_SECRET', 'ORANGE_MONEY_MERCHANT_KEY', 'ORANGE_MONEY_API_BASE_URL', 'ORANGE_MONEY_NOTIF_URL',
  'AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET', 'AIRTEL_MONEY_API_BASE_URL',
  'STRIPE_SECRET_KEY', 'STRIPE_API_BASE_URL', 'STRIPE_CURRENCY', 'STRIPE_MGA_RATE',
  'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_API_BASE_URL', 'PAYPAL_MGA_RATE', 'PAYPAL_CURRENCY',
  'PAYMENT_MVOLA_NUMBER', 'PAYMENT_ORANGE_MONEY_NUMBER', 'PAYMENT_AIRTEL_MONEY_NUMBER',
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let server: Server | null = null;

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = null;
  vi.restoreAllMocks();
});

async function startApp() {
  const app = express();
  app.use(express.json());
  await new Promise<void>((done) => {
    server = app.listen(0, '127.0.0.1', () => done());
  });
  const port = (server!.address() as { port: number }).port;
  return { app, port, url: `http://127.0.0.1:${port}` };
}

describe('setupDemoPayments', () => {
  it('reste inactif sans DEMO_PAYMENTS=true (jamais par défaut)', async () => {
    for (const k of KEYS) delete process.env[k];
    const { app, port } = await startApp();

    expect(setupDemoPayments(app, port)).toBe(false);
    expect(isDemoPayments()).toBe(false);
    expect(getMvolaClient()).toBeNull();
    expect(getOrangeClient()).toBeNull();
    expect(getAirtelClient()).toBeNull();
    expect(getStripeClient()).toBeNull();
    expect(getPaypalClient()).toBeNull();
  });

  it.each(['1', 'yes', 'TRUE', 'false', ''])('n’active pas le mode pour DEMO_PAYMENTS=%j (seul « true » exact)', async (value) => {
    for (const k of KEYS) delete process.env[k];
    process.env.DEMO_PAYMENTS = value;
    const { app, port } = await startApp();
    expect(setupDemoPayments(app, port)).toBe(false);
    expect(isDemoPayments()).toBe(false);
  });

  it.each(['MVOLA_CONSUMER_KEY', 'ORANGE_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_ID', 'STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_ID'])(
    'refuse de s’activer quand de vrais identifiants existent (%s) : jamais de faux paiement sur un vrai site',
    async (key) => {
      for (const k of KEYS) delete process.env[k];
      process.env.DEMO_PAYMENTS = 'true';
      process.env[key] = 'vrai-identifiant';
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { app, port } = await startApp();

      expect(setupDemoPayments(app, port)).toBe(false);
      expect(isDemoPayments()).toBe(false);
      expect(process.env[key]).toBe('vrai-identifiant'); // rien n'est écrasé
      expect(process.env.ORANGE_MONEY_API_BASE_URL).toBeUndefined();
    }
  );

  it('active tous les prestataires contre les simulateurs montés, et propose tous les moyens de paiement', async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.DEMO_PAYMENTS = 'true';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { app, port } = await startApp();

    expect(setupDemoPayments(app, port)).toBe(true);
    expect(isDemoPayments()).toBe(true);
    for (const id of ['mvola', 'orange_money', 'airtel_money', 'stripe', 'paypal']) expect(getAutomaticOperator(id)).not.toBeNull();
    expect(getPaymentMethods().map((m) => [m.id, m.automatic])).toEqual([
      ['mvola', true],
      ['orange_money', true],
      ['airtel_money', true],
      ['stripe', true],
      ['paypal', true],
    ]);
  });

  it('garde les numéros marchands déjà configurés', async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.DEMO_PAYMENTS = 'true';
    process.env.PAYMENT_MVOLA_NUMBER = '034 11 222 33';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { app, port } = await startApp();
    setupDemoPayments(app, port);
    expect(process.env.PAYMENT_MVOLA_NUMBER).toBe('034 11 222 33');
  });

  describe('parcours complet contre les simulateurs', () => {
    async function enable() {
      for (const k of KEYS) delete process.env[k];
      process.env.DEMO_PAYMENTS = 'true';
      process.env.DEMO_PAYMENTS_DELAY_MS = '50';
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const ctx = await startApp();
      setupDemoPayments(ctx.app, ctx.port);
      return ctx;
    }
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it('MVola : tout numéro 034 confirme, 034 35 000 04 refuse', async () => {
      await enable();
      const client = getMvolaClient()!;
      const ok = await client.initiate({ amount: 5000, reference: 'r1', description: 'Commande', payerNumber: '0341234567' });
      const refused = await client.initiate({ amount: 5000, reference: 'r2', description: 'Commande', payerNumber: '0343500004' });
      await wait(200);
      expect((await client.getStatus(ok.serverCorrelationId)).status).toBe('completed');
      expect((await client.getStatus(refused.serverCorrelationId)).status).toBe('failed');
    });

    it('Airtel Money : tout numéro 033 confirme, 033 35 000 04 refuse', async () => {
      await enable();
      const client = getAirtelClient()!;
      await client.initiate({ transactionId: 'a1', amount: 5000, payerNumber: '0331234567' });
      await client.initiate({ transactionId: 'a2', amount: 5000, payerNumber: '0333500004' });
      await wait(200);
      expect((await client.getStatus('a1')).status).toBe('completed');
      expect((await client.getStatus('a2')).status).toBe('failed');
    });

    it('Orange Money : la page de paiement est servie sur l’adresse PUBLIQUE du site, et le paiement aboutit', async () => {
      const { url } = await enable();
      const client = getOrangeClient()!;
      const session = await client.initiate({
        orderId: 'o1',
        amount: 5000,
        description: 'Commande',
        returnUrl: 'https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=retour',
        cancelUrl: 'https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=annule',
      });

      // Adresse publique (celle vue par le navigateur), pas l'adresse interne du backend
      expect(session.paymentUrl).toMatch(new RegExp(`^https://demo-public\\.example${DEMO_PATH}/orange/pay/[0-9a-f]+$`));

      // Le navigateur passe par nginx : on joint la même page via l'adresse interne
      const pagePath = new URL(session.paymentUrl).pathname;
      const page = await fetch(`${url}${pagePath}`);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain(`action="${pagePath}/success"`); // le formulaire reste sous le préfixe monté
      expect(html).toContain('simulation');

      const paid = await fetch(`${url}${pagePath}/success`, { method: 'POST', redirect: 'manual' });
      expect(paid.status).toBe(303);
      expect(paid.headers.get('location')).toBe('https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=retour');
      expect((await client.getStatus({ orderId: 'o1', amount: 5000, payToken: session.payToken })).status).toBe('completed');
    });

    it('Orange Money : annuler ramène sur l’adresse d’annulation', async () => {
      const { url } = await enable();
      const client = getOrangeClient()!;
      const session = await client.initiate({ orderId: 'o2', amount: 5000, description: 'Commande', returnUrl: 'https://d.example/ok', cancelUrl: 'https://d.example/ko' });
      const pagePath = new URL(session.paymentUrl).pathname;
      const cancelled = await fetch(`${url}${pagePath}/failed`, { method: 'POST', redirect: 'manual' });
      expect(cancelled.headers.get('location')).toBe('https://d.example/ko');
      expect((await client.getStatus({ orderId: 'o2', amount: 5000, payToken: session.payToken })).status).toBe('failed');
    });

    it('carte bancaire (Stripe) : page simulée sur l’adresse publique, le paiement aboutit', async () => {
      const { url } = await enable();
      const client = getStripeClient()!;
      const session = await client.createSession({
        reference: 'a1',
        amount: 5000,
        description: 'Commande',
        successUrl: 'https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=retour',
        cancelUrl: 'https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=annule',
      });
      expect(session.url).toMatch(new RegExp(`^https://demo-public\\.example${DEMO_PATH}/stripe/pay/cs_test_`));

      const pagePath = new URL(session.url).pathname;
      expect(await (await fetch(`${url}${pagePath}`)).text()).toContain(`action="${pagePath}/success"`);
      const paid = await fetch(`${url}${pagePath}/success`, { method: 'POST', redirect: 'manual' });
      expect(paid.headers.get('location')).toBe('https://demo-public.example/checkout/confirmation?order=ORD-1&paiement=retour');
      expect((await client.getSession(session.sessionId)).status).toBe('completed');
    });

    it('PayPal : approbation sur la page simulée, puis encaissement par le serveur', async () => {
      const { url } = await enable();
      const client = getPaypalClient()!;
      const order = await client.createOrder({ reference: 'a2', amount: 100, description: 'Commande', returnUrl: 'https://d.example/ok', cancelUrl: 'https://d.example/ko' });
      const pagePath = new URL(order.approveUrl).pathname;
      const approved = await fetch(`${url}${pagePath}/approve`, { method: 'POST', redirect: 'manual' });
      expect(approved.headers.get('location')).toMatch(/^https:\/\/d\.example\/ok\?token=/);
      expect((await client.getOrder(order.orderId)).orderStatus).toBe('APPROVED');
      expect((await client.capture(order.orderId)).status).toBe('completed');
    });

    it('n’enregistre pas l’historique des requêtes (serveur longue durée)', async () => {
      // Le mode démo tourne des semaines : aucune fuite mémoire par requête. Vérifié via l'option dédiée des simulateurs.
      const { createMockAirtel } = await import('../testing/mockAirtelServer.js');
      const mock = createMockAirtel({ recordRequests: false });
      const { url } = await mock.listen();
      await fetch(`${url}/auth/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await mock.close();
      expect(mock.requests).toHaveLength(0);
    });
  });
});

describe('requestOrigin', () => {
  const req = (headers: Record<string, string>, protocol = 'http') =>
    ({ get: (name: string) => headers[name.toLowerCase()], protocol }) as any;

  it('n’existe qu’en mode démo : en production, l’adresse vient de la configuration, jamais d’un en-tête', () => {
    for (const k of KEYS) delete process.env[k];
    const app = express();
    setupDemoPayments(app, 1); // inactif
    expect(requestOrigin(req({ 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }))).toBeUndefined();
  });

  describe('en mode démo', () => {
    async function enable() {
      for (const k of KEYS) delete process.env[k];
      process.env.DEMO_PAYMENTS = 'true';
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setupDemoPayments(express(), 1);
    }

    it('reprend l’adresse publique posée par nginx', async () => {
      await enable();
      expect(requestOrigin(req({ 'x-forwarded-host': 'abc-def.trycloudflare.com', 'x-forwarded-proto': 'https' }))).toBe('https://abc-def.trycloudflare.com');
      expect(requestOrigin(req({ 'x-forwarded-host': '167.86.111.192:8081', 'x-forwarded-proto': 'http' }))).toBe('http://167.86.111.192:8081');
      expect(requestOrigin(req({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
    });

    it('préfère l’en-tête Origin (site et API sur des ports différents en local)', async () => {
      await enable();
      expect(requestOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3011' }))).toBe('http://localhost:3000');
      expect(requestOrigin(req({ origin: 'https://abc.trycloudflare.com', 'x-forwarded-host': 'autre.example' }))).toBe('https://abc.trycloudflare.com');
    });

    it.each(['null', 'javascript:alert(1)', 'http://evil.example/chemin', 'ftp://x.example', 'pas une url'])(
      'ignore un Origin inexploitable (%j) et se rabat sur nginx',
      async (origin) => {
        await enable();
        expect(requestOrigin(req({ origin, 'x-forwarded-host': 'demo.example', 'x-forwarded-proto': 'https' }))).toBe('https://demo.example');
      }
    );

    it.each(['evil.example/path', 'a b', 'x@evil.example', 'evil.example:port', '', 'javascript:alert(1)'])('rejette un hôte forgé : %j', async (host) => {
      await enable();
      expect(requestOrigin(req({ 'x-forwarded-host': host, 'x-forwarded-proto': 'https' }))).toBeUndefined();
    });

    it('rejette un protocole autre que http(s)', async () => {
      await enable();
      expect(requestOrigin(req({ 'x-forwarded-host': 'demo.example', 'x-forwarded-proto': 'javascript' }))).toBeUndefined();
    });
  });
});
