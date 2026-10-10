import { describe, it, expect } from 'vitest';
import { fromAriary, fromDecimalString, parseRate, toDecimalString } from './currency.js';
import { getStripeConfig, mapStripeSession, stripeForm } from './stripe.js';
import { getPaypalConfig, mapPaypalOrder } from './paypal.js';

describe('conversion Ariary -> devise du prestataire', () => {
  it('garde l’Ariary tel quel (devise sans décimales, acceptée par Stripe)', () => {
    expect(fromAriary(150_000, { currency: 'MGA', rate: null })).toBe(150_000);
  });

  it('convertit en centimes au taux configuré, arrondi au-dessus (la plateforme ne reçoit jamais moins)', () => {
    expect(fromAriary(150_000, { currency: 'EUR', rate: 5000 })).toBe(3000); // 30,00 €
    expect(fromAriary(150_001, { currency: 'EUR', rate: 5000 })).toBe(3001);
    expect(fromAriary(5000, { currency: 'EUR', rate: 5000 })).toBe(100); // pas d'arrondi parasite (flottants)
    expect(fromAriary(100_000, { currency: 'USD', rate: 4500 })).toBe(2223);
  });

  it('refuse de convertir sans taux', () => {
    expect(fromAriary(100, { currency: 'EUR', rate: null })).toBeNull();
  });

  it('lit un taux positif (espaces, virgule décimale) et rejette le reste', () => {
    expect(parseRate('5000')).toBe(5000);
    expect(parseRate(' 4 950,5 ')).toBe(4950.5);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('-3')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate(undefined)).toBeNull();
  });

  it('passe des unités mineures au format décimal de PayPal et inversement', () => {
    expect(toDecimalString(3001, 'EUR')).toBe('30.01');
    expect(toDecimalString(500, 'JPY')).toBe('500');
    expect(fromDecimalString('30.01', 'EUR')).toBe(3001);
    expect(fromDecimalString('30', 'EUR')).toBe(3000);
    expect(fromDecimalString('1e3', 'EUR')).toBeNull();
    expect(fromDecimalString(30, 'EUR')).toBeNull();
  });
});

describe('getStripeConfig', () => {
  it('est null sans clé secrète : la carte bancaire n’est pas proposée', () => {
    expect(getStripeConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('facture en Ariary par défaut, détecte une clé de test', () => {
    expect(getStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_123' } as NodeJS.ProcessEnv)).toMatchObject({
      currency: 'MGA',
      sandbox: true,
      baseUrl: 'https://api.stripe.com',
    });
    expect(getStripeConfig({ STRIPE_SECRET_KEY: 'sk_live_123' } as NodeJS.ProcessEnv)?.sandbox).toBe(false);
  });

  it('exige un taux pour une autre devise que l’Ariary', () => {
    expect(getStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_CURRENCY: 'eur' } as NodeJS.ProcessEnv)).toBeNull();
    expect(getStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_CURRENCY: 'eur', STRIPE_MGA_RATE: '5000' } as NodeJS.ProcessEnv)).toMatchObject({
      currency: 'EUR',
      rate: 5000,
    });
  });
});

describe('getPaypalConfig', () => {
  const base = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_MGA_RATE: '5000' } as NodeJS.ProcessEnv;

  it('est null tant que identifiants ou taux manquent (PayPal n’accepte pas l’Ariary)', () => {
    expect(getPaypalConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getPaypalConfig({ ...base, PAYPAL_CLIENT_SECRET: '' })).toBeNull();
    expect(getPaypalConfig({ ...base, PAYPAL_MGA_RATE: '' })).toBeNull();
    expect(getPaypalConfig({ ...base, PAYPAL_CURRENCY: 'MGA' })).toBeNull();
  });

  it('utilise le bac à sable et l’euro par défaut, la production sur demande explicite', () => {
    expect(getPaypalConfig(base)).toMatchObject({ sandbox: true, currency: 'EUR', baseUrl: 'https://api-m.sandbox.paypal.com' });
    expect(getPaypalConfig({ ...base, PAYPAL_ENV: 'production' })).toMatchObject({ sandbox: false, baseUrl: 'https://api-m.paypal.com' });
    expect(getPaypalConfig({ ...base, PAYPAL_ENV: 'prod' })?.sandbox).toBe(true); // valeur ambiguë : bac à sable
  });
});

describe('statuts des prestataires', () => {
  it('Stripe : seul « paid » valide ; une session expirée échoue ; le reste attend', () => {
    expect(mapStripeSession({ status: 'complete', payment_status: 'paid' })).toBe('completed');
    expect(mapStripeSession({ status: 'expired', payment_status: 'unpaid' })).toBe('failed');
    expect(mapStripeSession({ status: 'open', payment_status: 'unpaid' })).toBe('pending');
    expect(mapStripeSession({ status: 'complete', payment_status: 'unpaid' })).toBe('pending'); // paiement différé
    expect(mapStripeSession({})).toBe('pending');
  });

  it('PayPal : payé seulement quand la capture est COMPLETED', () => {
    const withCapture = (status: string, captureStatus?: string) => ({
      status,
      purchase_units: [{ payments: captureStatus ? { captures: [{ id: 'CAP1', status: captureStatus }] } : undefined }],
    });
    expect(mapPaypalOrder(withCapture('COMPLETED', 'COMPLETED'))).toMatchObject({ status: 'completed', captureId: 'CAP1' });
    expect(mapPaypalOrder(withCapture('COMPLETED', 'PENDING')).status).toBe('pending');
    expect(mapPaypalOrder(withCapture('COMPLETED', 'DECLINED')).status).toBe('failed');
    expect(mapPaypalOrder(withCapture('APPROVED'))).toMatchObject({ status: 'pending', orderStatus: 'APPROVED' });
    expect(mapPaypalOrder(withCapture('PAYER_ACTION_REQUIRED')).status).toBe('pending');
    expect(mapPaypalOrder(withCapture('VOIDED')).status).toBe('failed');
    expect(mapPaypalOrder(null).status).toBe('pending');
  });
});

describe('stripeForm', () => {
  it('encode les clés imbriquées à la manière de Stripe', () => {
    expect(stripeForm({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'mga' } }], skip: undefined })).toEqual([
      'mode=payment',
      'line_items%5B0%5D%5Bquantity%5D=1',
      'line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=mga',
    ]);
  });
});
