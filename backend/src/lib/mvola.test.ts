import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockMvola } from '../testing/mockMvolaServer.js';
import { MvolaClient, MvolaError, getMvolaConfig, mapMvolaStatus, type MvolaConfig } from './mvola.js';
import { isMvolaNumber, normalizeMalagasyMobile } from './phone.js';

describe('normalizeMalagasyMobile / isMvolaNumber', () => {
  it.each([
    ['034 12 345 67', '0341234567'],
    ['+261 34 12 345 67', '0341234567'],
    ['0026134 12 345 67', '0341234567'],
    ['261341234567', '0341234567'],
    ['034.12.345.67', '0341234567'],
    ['(038) 12-345-67', '0381234567'],
  ])('normalise %s', (input, expected) => {
    expect(normalizeMalagasyMobile(input)).toBe(expected);
  });

  it.each(['', 'abc', '034 12', '0141234567', '+33 6 12 34 56 78', '03412345678'])('rejette %j', (input) => {
    expect(normalizeMalagasyMobile(input)).toBeNull();
  });

  it('reconnaît uniquement les préfixes MVola (034, 038)', () => {
    expect(isMvolaNumber('0341234567')).toBe(true);
    expect(isMvolaNumber('0381234567')).toBe(true);
    expect(isMvolaNumber('0321234567')).toBe(false); // Orange Money
    expect(isMvolaNumber('0331234567')).toBe(false); // Airtel Money
  });
});

describe('getMvolaConfig', () => {
  const base = { MVOLA_CONSUMER_KEY: 'k', MVOLA_CONSUMER_SECRET: 's', MVOLA_MERCHANT_NUMBER: '034 00 000 00' } as NodeJS.ProcessEnv;

  it('est null tant que les identifiants ne sont pas tous renseignés (le paiement manuel reste seul actif)', () => {
    expect(getMvolaConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getMvolaConfig({ ...base, MVOLA_CONSUMER_SECRET: '' })).toBeNull();
    expect(getMvolaConfig({ ...base, MVOLA_MERCHANT_NUMBER: 'pas-un-numero' })).toBeNull();
  });

  it('utilise le bac à sable par défaut, la production seulement sur demande explicite', () => {
    expect(getMvolaConfig(base)).toMatchObject({ sandbox: true, baseUrl: 'https://devapi.mvola.mg', merchantNumber: '0340000000' });
    expect(getMvolaConfig({ ...base, MVOLA_ENV: 'production' })).toMatchObject({ sandbox: false, baseUrl: 'https://api.mvola.mg' });
    expect(getMvolaConfig({ ...base, MVOLA_ENV: 'Prod' })?.sandbox).toBe(true); // valeur ambiguë : on reste en bac à sable
  });

  it('accepte une URL de base personnalisée (faux serveur) et une URL de rappel', () => {
    const c = getMvolaConfig({ ...base, MVOLA_API_BASE_URL: 'http://localhost:4010/', MVOLA_CALLBACK_URL: 'https://x.mg/cb', MVOLA_LANGUAGE: 'mg' });
    expect(c).toMatchObject({ baseUrl: 'http://localhost:4010', callbackUrl: 'https://x.mg/cb', language: 'MG' });
  });
});

describe('mapMvolaStatus', () => {
  it.each([['completed', 'completed'], ['SUCCESS', 'completed'], ['failed', 'failed'], ['rejected', 'failed'], ['expired', 'failed'], ['pending', 'pending']])(
    '%s -> %s',
    (input, expected) => expect(mapMvolaStatus(input)).toBe(expected)
  );

  it.each([undefined, null, 42, '', 'inconnu'])('un statut inconnu (%j) reste « pending » : on ne valide jamais sur une supposition', (input) => {
    expect(mapMvolaStatus(input)).toBe('pending');
  });
});

describe('MvolaClient (contre le faux serveur MVola)', () => {
  const mock = createMockMvola({ consumerKey: 'test-key', consumerSecret: 'test-secret' });
  let config: MvolaConfig;

  beforeAll(async () => {
    const { url } = await mock.listen();
    config = {
      consumerKey: 'test-key',
      consumerSecret: 'test-secret',
      merchantNumber: '0340000000',
      partnerName: 'Tsena Pro',
      baseUrl: url,
      sandbox: true,
      language: 'FR',
      callbackUrl: 'https://all.example/api/payments/mvola/callback',
    };
  });
  afterAll(() => mock.close());
  beforeEach(() => {
    mock.requests.length = 0;
    mock.transactions.clear();
  });

  const params = { amount: 2_250_000, reference: 'attempt-1', description: 'Commande ORD-1', payerNumber: '034 35 000 03' };

  it('obtient un jeton (Basic + client_credentials + scope) et le réutilise', async () => {
    const client = new MvolaClient(config);
    const before = mock.tokenCount();

    await client.initiate(params);
    await client.initiate({ ...params, reference: 'attempt-2' });

    expect(mock.tokenCount() - before).toBe(1);
    const tokenRequest = mock.requests.find((r) => r.path === '/token')!;
    expect(tokenRequest.headers.authorization).toBe(`Basic ${Buffer.from('test-key:test-secret').toString('base64')}`);
    expect(tokenRequest.body).toEqual({ grant_type: 'client_credentials', scope: 'EXT_INT_MVOLA_SCOPE' });
  });

  it('envoie la demande de paiement avec les en-têtes et le corps attendus', async () => {
    const client = new MvolaClient(config);

    const result = await client.initiate(params);

    const req = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/merchantpay/1.0.0/'))!;
    expect(req.headers).toMatchObject({
      version: '1.0',
      userlanguage: 'FR',
      useraccountidentifier: 'msisdn;0340000000',
      partnername: 'Tsena Pro',
      'x-callback-url': 'https://all.example/api/payments/mvola/callback',
      'cache-control': 'no-cache',
    });
    expect(req.headers['x-correlationid']).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.body).toMatchObject({
      amount: '2250000', // chaîne, en Ariary entiers
      currency: 'Ar',
      descriptionText: 'Commande ORD-1',
      requestingOrganisationTransactionReference: 'attempt-1',
      originalTransactionReference: 'attempt-1',
      debitParty: [{ key: 'msisdn', value: '0343500003' }],
      creditParty: [{ key: 'msisdn', value: '0340000000' }],
    });
    expect(req.body.metadata).toEqual(expect.arrayContaining([{ key: 'partnerName', value: 'Tsena Pro' }]));
    expect(result).toMatchObject({ status: 'pending', notificationMethod: 'callback' });
    expect(result.serverCorrelationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tronque la description à 40 caractères', async () => {
    const client = new MvolaClient(config);
    await client.initiate({ ...params, description: 'x'.repeat(80) });
    const req = mock.requests.find((r) => r.path.endsWith('/merchantpay/1.0.0/'))!;
    expect(req.body.descriptionText).toHaveLength(40);
  });

  it('suit une transaction jusqu’à « completed » puis en lit les détails', async () => {
    const client = new MvolaClient(config);
    const { serverCorrelationId } = await client.initiate(params);

    expect(await client.getStatus(serverCorrelationId)).toMatchObject({ status: 'pending' });

    mock.resolveTransaction(serverCorrelationId, 'completed');
    const status = await client.getStatus(serverCorrelationId);
    expect(status.status).toBe('completed');
    expect(status.objectReference).toBeTruthy();

    const tx = await client.getTransaction(status.objectReference!);
    expect(tx).toMatchObject({ amount: 2_250_000, currency: 'Ar', status: 'completed', debitMsisdn: '0343500003', creditMsisdn: '0340000000', reference: 'attempt-1' });
  });

  it('remonte « failed » quand le client refuse', async () => {
    const client = new MvolaClient(config);
    const { serverCorrelationId } = await client.initiate({ ...params, payerNumber: '0343500004' });
    mock.resolveTransaction(serverCorrelationId, 'failed');
    expect((await client.getStatus(serverCorrelationId)).status).toBe('failed');
  });

  it('renouvelle le jeton une fois quand MVola le refuse (401)', async () => {
    const client = new MvolaClient(config);
    await client.initiate(params);
    mock.revokeTokens();
    const before = mock.tokenCount();

    await expect(client.initiate({ ...params, reference: 'attempt-3' })).resolves.toMatchObject({ status: 'pending' });

    expect(mock.tokenCount() - before).toBe(1);
  });

  it('signale des identifiants refusés sans réessayer indéfiniment', async () => {
    const client = new MvolaClient({ ...config, consumerSecret: 'mauvais' });

    const error = await client.initiate(params).catch((e) => e);

    expect(error).toBeInstanceOf(MvolaError);
    expect(error.status).toBe(401);
    expect(error.retriable).toBe(false);
  });

  it('marque une panne de MVola (500) comme réessayable', async () => {
    const client = new MvolaClient(config);
    const error = await client.initiate({ ...params, payerNumber: '0343500007' }).catch((e) => e);
    expect(error).toBeInstanceOf(MvolaError);
    expect(error.status).toBe(500);
    expect(error.retriable).toBe(true);
    expect(error.message).toContain('Internal error');
  });

  it('marque un serveur injoignable comme réessayable', async () => {
    const client = new MvolaClient({ ...config, baseUrl: 'http://127.0.0.1:1' });
    const error = await client.initiate(params).catch((e) => e);
    expect(error).toBeInstanceOf(MvolaError);
    expect(error.retriable).toBe(true);
    expect(error.status).toBeUndefined();
  });

  it.each([
    ['numéro Orange Money', { payerNumber: '032 12 345 67' }],
    ['numéro invalide', { payerNumber: '12' }],
    ['montant nul', { amount: 0 }],
    ['montant non entier', { amount: 100.5 }],
  ])('refuse la demande avant tout appel réseau (%s)', async (_label, patch) => {
    const client = new MvolaClient(config);
    await expect(client.initiate({ ...params, ...patch })).rejects.toBeInstanceOf(MvolaError);
    expect(mock.requests).toHaveLength(0);
  });

  it('refuse une réponse de paiement sans identifiant de suivi', async () => {
    const client = new MvolaClient(config, (async () =>
      new Response(JSON.stringify({ access_token: 't', expires_in: 3600, status: 'pending' }), { status: 200 })) as typeof fetch);
    await expect(client.initiate(params)).rejects.toThrow(/invalide/);
  });
});
