import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/sms.js', () => ({
  sendSms: vi.fn().mockResolvedValue(true),
  smsEnabled: vi.fn(() => true),
}));

import { sendSms } from '../lib/sms.js';
import {
  sendOrderPlacedSms,
  sendOrderStatusSms,
  sendPaymentConfirmedSms,
  sendPaymentReminderSms,
  smsDateTime,
  smsPrice,
} from './smsNotifications.js';

const sendMock = vi.mocked(sendSms);
const lastText = () => sendMock.mock.calls.at(-1)![1];

beforeEach(() => {
  sendMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SMS de suivi de commande', () => {
  it('formate les montants et les dates pour un SMS (heure de Madagascar)', () => {
    expect(smsPrice(1250000)).toBe('1 250 000 Ar');
    expect(smsDateTime(new Date('2026-10-25T11:30:00Z'))).toBe('25/10 a 14h30');
  });

  it('commande enregistrée : montant, numéro marchand et date limite', () => {
    sendOrderPlacedSms({
      phone: '034 12 345 67',
      orderNumbers: ['ORD-A', 'ORD-B'],
      totalAmount: 185000,
      paymentNumber: '0340000000',
      paymentLabel: 'MVola',
      expiresAt: new Date('2026-10-26T09:00:00Z'),
    });

    expect(sendMock).toHaveBeenCalledWith('034 12 345 67', expect.any(String));
    expect(lastText()).toBe(
      'Tsena Pro : Commandes ORD-A (+1) enregistree. Payez 185 000 Ar par MVola au 0340000000 avant le 26/10 a 12h00.'
    );
  });

  it('tous les textes tiennent dans un SMS sans accents (160 caractères)', () => {
    const long = 'ORD-MH4K2J9Z-ABC123';
    sendOrderPlacedSms({
      phone: '0341234567',
      orderNumbers: [long, long, long],
      totalAmount: 99999999,
      paymentNumber: '0341234567',
      paymentLabel: 'Orange Money',
      expiresAt: new Date(),
    });
    sendPaymentReminderSms({ phone: '0341234567', orderNumbers: [long, long], totalAmount: 99999999, expiresAt: new Date() });
    sendPaymentConfirmedSms({ phone: '0341234567', orderNumbers: [long, long], totalAmount: 99999999 });
    for (const status of ['shipped', 'delivered', 'cancelled'] as const) {
      sendOrderStatusSms({ phone: '0341234567', orderNumber: long, status });
    }
    sendOrderStatusSms({ phone: '0341234567', orderNumber: long, status: 'shipped', pickup: true });
    // Textes saisis à rallonge (nom du relais, transporteur, numéro de suivi) : tronqués
    sendOrderStatusSms({ phone: '0341234567', orderNumber: long, status: 'shipped', relayName: 'Épicerie du marché couvert d’Analakely, pavillon 3, porte 12' });
    sendOrderStatusSms({ phone: '0341234567', orderNumber: long, status: 'shipped', carrier: 'Coopérative KOFMAD transports rapides', trackingNumber: 'KOF-2026-10-25-000123456789' });

    expect(sendMock).toHaveBeenCalledTimes(9);
    for (const [, text] of sendMock.mock.calls) {
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('garde le numéro de commande tel quel (le client le recopie)', () => {
    sendPaymentConfirmedSms({ phone: '0341234567', orderNumbers: ['ORD-MVMOOFFF-1XMD7O'], totalAmount: 6_880_000 });
    expect(lastText()).toBe('Tsena Pro : paiement de 6 880 000 Ar recu pour commande ORD-MVMOOFFF-1XMD7O. Merci ! Nous preparons votre commande.');
  });

  it('n’envoie rien sans mobile malgache, ou si les SMS de commande sont désactivés', () => {
    sendOrderStatusSms({ phone: null, orderNumber: 'ORD-A', status: 'shipped' });
    sendOrderStatusSms({ phone: '+33612345678', orderNumber: 'ORD-A', status: 'shipped' });
    vi.stubEnv('SMS_ORDER_NOTIFICATIONS', 'false');
    sendOrderStatusSms({ phone: '0341234567', orderNumber: 'ORD-A', status: 'shipped' });

    expect(sendMock).not.toHaveBeenCalled();
  });
});
