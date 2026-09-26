import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockOrange } from '../testing/mockOrangeServer.js';
import { OrangeMoneyClient, getOrangeConfig, mapOrangeStatus, type OrangeConfig } from './orangeMoney.js';
import { OperatorError } from './operatorHttp.js';
import { isOrangeNumber, isAirtelNumber } from './phone.js';

describe('isOrangeNumber / isAirtelNumber', () => {
  it('reconnaît les préfixes Orange (032, 037) et Airtel (033)', () => {
    expect(isOrangeNumber('0321234567')).toBe(true);
    expect(isOrangeNumber('0371234567')).toBe(true);
    expect(isOrangeNumber('0341234567')).toBe(false); // MVola
    expect(isOrangeNumber('0331234567')).toBe(false); // Airtel
    expect(isAirtelNumber('0331234567')).toBe(true);
    expect(isAirtelNumber('0321234567')).toBe(false);
    expect(isAirtelNumber('0381234567')).toBe(false);
  });
});

describe('getOrangeConfig', () => {
  const base = {
    ORANGE_MONEY_CLIENT_ID: 'id',
    ORANGE_MONEY_CLIENT_SECRET: 'secret',
    ORANGE_MONEY_MERCHANT_KEY: 'merchant',
    PUBLIC_SITE_URL: 'https://all.example.mg/',
  } as NodeJS.ProcessEnv;

  it('est null tant que identifiants ou adresse publique manquent (le paiement manuel reste seul actif)', () => {
    expect(getOrangeConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getOrangeConfig({ ...base, ORANGE_MONEY_CLIENT_SECRET: '' })).toBeNull();
    expect(getOrangeConfig({ ...base, ORANGE_MONEY_MERCHANT_KEY: '' })).toBeNull();
    expect(getOrangeConfig({ ...base, PUBLIC_SITE_URL: '' })).toBeNull();
    expect(getOrangeConfig({ ...base, PUBLIC_SITE_URL: 'pas-une-url' })).toBeNull();
  });

  it('utilise le bac à sable (pays « dev », devise OUV) par défaut, la production (mg / MGA) sur demande explicite', () => {
    expect(getOrangeConfig(base)).toMatchObject({ sandbox: true, country: 'dev', currency: 'OUV', baseUrl: 'https://api.orange.com' });
    expect(getOrangeConfig({ ...base, ORANGE_MONEY_ENV: 'production' })).toMatchObject({ sandbox: false, country: 'mg', currency: 'MGA' });
    expect(getOrangeConfig({ ...base, ORANGE_MONEY_ENV: 'Prod' })?.sandbox).toBe(true); // valeur ambiguë : bac à sable
  });

  it('déduit l’URL de notification du site public, avec possibilité de la forcer, et accepte FRONTEND_URL en repli', () => {
    expect(getOrangeConfig(base)?.notifUrl).toBe('https://all.example.mg/api/payments/auto/callback/orange_money');
    expect(getOrangeConfig({ ...base, ORANGE_MONEY_NOTIF_URL: 'https://x.mg/n' })?.notifUrl).toBe('https://x.mg/n');
    const fallback = getOrangeConfig({ ...base, PUBLIC_SITE_URL: '', FRONTEND_URL: 'https://front.mg' });
    expect(fallback?.siteUrl).toBe('https://front.mg');
  });
});

describe('mapOrangeStatus', () => {
  it.each([['SUCCESS', 'completed'], ['FAILED', 'failed'], ['EXPIRED', 'failed'], ['PENDING', 'pending'], ['INITIATED', 'pending']])('%s -> %s', (input, expected) =>
    expect(mapOrangeStatus(input)).toBe(expected)
  );

  it.each([undefined, null, 42, '', 'INCONNU'])('un statut inconnu (%j) reste « pending » : jamais de validation sur une supposition', (input) => {
    expect(mapOrangeStatus(input)).toBe('pending');
  });
});

describe('OrangeMoneyClient (contre le faux serveur Orange)', () => {
  const mock = createMockOrange({ clientId: 'test-client', clientSecret: 'test-secret', merchantKey: 'test-merchant' });
  let config: OrangeConfig;
  let client: OrangeMoneyClient;
  const params = { orderId: 'abc123', amount: 150_000, description: 'Commande ORD-1', returnUrl: 'https://tsenapro.mg/back', cancelUrl: 'https://tsenapro.mg/cancel' };

  beforeAll(async () => {
    const { url } = await mock.listen();
    config = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      merchantKey: 'test-merchant',
      sandbox: true,
      baseUrl: url,
      country: 'dev',
      currency: 'OUV',
      language: 'fr',
      siteUrl: 'https://tsenapro.mg',
      notifUrl: 'http://127.0.0.1:9/notif', // injoignable : la notification est sans importance ici
    };
  });
  afterAll(() => mock.close());
  beforeEach(() => {
    mock.requests.length = 0;
    mock.sessions.clear();
    client = new OrangeMoneyClient(config);
  });

  it('crée une session de paiement et renvoie la page d’Orange', async () => {
    const session = await client.initiate(params);

    expect(session.payToken).toBeTruthy();
    expect(session.paymentUrl).toContain('/pay/');
    expect(session.notifToken).toBeTruthy();

    const request = mock.requests.find((r) => r.path.endsWith('/webpayment'))!;
    expect(request.headers.authorization).toMatch(/^Bearer orange-token-/);
    expect(request.body).toMatchObject({
      merchant_key: 'test-merchant',
      currency: 'OUV',
      order_id: 'abc123',
      amount: 150_000,
      return_url: 'https://tsenapro.mg/back',
      cancel_url: 'https://tsenapro.mg/cancel',
      notif_url: config.notifUrl,
    });
  });

  it('s’authentifie en Basic avec client_credentials et met le jeton en cache', async () => {
    await client.initiate(params);
    await client.initiate({ ...params, orderId: 'def456' });

    const tokenCalls = mock.requests.filter((r) => r.path === '/oauth/v3/token');
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].headers.authorization).toBe(`Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
    expect(tokenCalls[0].body).toMatchObject({ grant_type: 'client_credentials' });
  });

  it('renouvelle le jeton une fois s’il est refusé (401)', async () => {
    const before = mock.tokenCount();
    await client.initiate(params);
    mock.revokeTokens();
    const session = await client.initiate({ ...params, orderId: 'def456' });
    expect(session.payToken).toBeTruthy();
    expect(mock.tokenCount()).toBe(before + 2);
  });

  it('rapporte « pending » puis « completed » avec l’identifiant de transaction une fois payé', async () => {
    const session = await client.initiate(params);
    expect(await client.getStatus({ orderId: 'abc123', amount: 150_000, payToken: session.payToken })).toEqual({ status: 'pending', transactionId: undefined });

    mock.resolveSession(session.payToken, 'SUCCESS');
    const done = await client.getStatus({ orderId: 'abc123', amount: 150_000, payToken: session.payToken });
    expect(done.status).toBe('completed');
    expect(done.transactionId).toMatch(/^MP\d+/);
  });

  it('rapporte « failed » quand le client annule', async () => {
    const session = await client.initiate(params);
    mock.resolveSession(session.payToken, 'FAILED');
    expect((await client.getStatus({ orderId: 'abc123', amount: 150_000, payToken: session.payToken })).status).toBe('failed');
  });

  it('envoie le montant attendu à chaque vérification : un montant différent est refusé par Orange, jamais validé', async () => {
    const session = await client.initiate(params);
    mock.resolveSession(session.payToken, 'SUCCESS');
    await expect(client.getStatus({ orderId: 'abc123', amount: 1, payToken: session.payToken })).rejects.toMatchObject({ status: 400 });
    expect(mock.requests.filter((r) => r.path.endsWith('/transactionstatus')).at(-1)!.body).toMatchObject({ order_id: 'abc123', amount: 1 });
  });

  it('signale une transaction inconnue par une erreur 404', async () => {
    const error = await client.getStatus({ orderId: 'abc123', amount: 150_000, payToken: 'inconnu' }).catch((e) => e);
    expect(error).toBeInstanceOf(OperatorError);
    expect(error.status).toBe(404);
  });

  it('refuse un montant invalide avant tout appel réseau', async () => {
    for (const amount of [0, -5, 10.5]) {
      await expect(client.initiate({ ...params, amount })).rejects.toThrow('Montant invalide');
    }
    expect(mock.requests).toHaveLength(0);
  });

  it('traite une panne d’Orange (500) comme réessayable, une clé marchande refusée comme définitive', async () => {
    mock.failNextSession();
    const outage = await client.initiate(params).catch((e) => e);
    expect(outage).toMatchObject({ status: 500, retriable: true });

    const wrong = new OrangeMoneyClient({ ...config, merchantKey: 'mauvaise' });
    const refused = await wrong.initiate(params).catch((e) => e);
    expect(refused).toMatchObject({ status: 401, retriable: false });
  });

  it('refuse des identifiants invalides à l’authentification', async () => {
    const bad = new OrangeMoneyClient({ ...config, clientSecret: 'faux' });
    await expect(bad.initiate(params)).rejects.toMatchObject({ status: 401 });
  });

  it('rejette une réponse sans page de paiement valide', async () => {
    const broken = new OrangeMoneyClient(config, (async (url: any, init: any) => {
      if (String(url).endsWith('/oauth/v3/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      return new Response(JSON.stringify({ status: 201, pay_token: 'x', payment_url: 'javascript:alert(1)' }));
    }) as typeof fetch);
    await expect(broken.initiate(params)).rejects.toThrow('page de paiement manquante');
  });

  it('convertit une erreur réseau en erreur réessayable', async () => {
    const down = new OrangeMoneyClient(config, (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    const error = await down.initiate(params).catch((e) => e);
    expect(error).toMatchObject({ retriable: true });
    expect(error.message).toContain('injoignable');
  });
});
