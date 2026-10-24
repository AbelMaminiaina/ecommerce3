import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSmsConfig, resetSmsTokenCache, sendSms, toInternational } from './sms.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  resetSmsTokenCache();
});

describe('getSmsConfig', () => {
  it('passe en démonstration hors production, et ne fait rien en production sans prestataire', () => {
    expect(getSmsConfig({ NODE_ENV: 'development' })?.provider).toBe('demo');
    expect(getSmsConfig({ NODE_ENV: 'production' })).toBeNull();
  });

  it('exige les identifiants du prestataire choisi', () => {
    expect(getSmsConfig({ SMS_PROVIDER: 'orange', ORANGE_SMS_CLIENT_ID: 'id' })).toBeNull();
    expect(getSmsConfig({ SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' })).toBeNull();
    expect(getSmsConfig({ SMS_PROVIDER: 'inconnu' })).toBeNull();
  });
});

describe('sendSms', () => {
  it('convertit le numéro au format international', () => {
    expect(toInternational('0341234567')).toBe('+261341234567');
  });

  it('n’envoie rien vers un numéro qui n’est pas un mobile malgache', async () => {
    const fetchFn = vi.fn();
    const sent = await sendSms('0201234567', 'x', { env: { SMS_PROVIDER: 'twilio' }, fetchFn });
    expect(sent).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Orange : obtient un jeton OAuth, le réutilise, et envoie au format de l’API SMS', async () => {
    const env = {
      SMS_PROVIDER: 'orange',
      ORANGE_SMS_CLIENT_ID: 'id',
      ORANGE_SMS_CLIENT_SECRET: 'secret',
      ORANGE_SMS_SENDER_NAME: 'TsenaPro',
    };
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/oauth/v3/token') ? json({ access_token: 'tok', expires_in: 3600 }) : json({}, 201)
    );

    await sendSms('034 12 345 67', 'Bonjour', { env, fetchFn: fetchFn as any });
    await sendSms('0321234567', 'Encore', { env, fetchFn: fetchFn as any });

    expect(fetchFn).toHaveBeenCalledTimes(3); // un seul jeton pour deux SMS
    const [tokenUrl, tokenInit] = fetchFn.mock.calls[0] as any;
    expect(tokenUrl).toBe('https://api.orange.com/oauth/v3/token');
    expect(tokenInit.headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(tokenInit.body).toBe('grant_type=client_credentials');

    const [sendUrl, sendInit] = fetchFn.mock.calls[1] as any;
    expect(sendUrl).toBe('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2610000/requests');
    expect(sendInit.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(sendInit.body)).toEqual({
      outboundSMSMessageRequest: {
        address: 'tel:+261341234567',
        senderAddress: 'tel:+2610000',
        senderName: 'TsenaPro',
        outboundSMSTextMessage: { message: 'Bonjour' },
      },
    });
  });

  it('Twilio : envoie le formulaire attendu', async () => {
    const env = { SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15550000000' };
    const fetchFn = vi.fn(async () => json({ sid: 'SM1' }, 201));

    await sendSms('0331234567', 'Salut', { env, fetchFn: fetchFn as any });

    const [url, init] = fetchFn.mock.calls[0] as any;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    expect(new URLSearchParams(init.body).get('To')).toBe('+261331234567');
  });

  it('lève une erreur quand le prestataire refuse', async () => {
    const env = { SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1' };
    const fetchFn = vi.fn(async () => json({ message: 'Invalid number' }, 400));

    await expect(sendSms('0331234567', 'x', { env, fetchFn: fetchFn as any })).rejects.toThrow(/400.*Invalid number/);
  });
});
