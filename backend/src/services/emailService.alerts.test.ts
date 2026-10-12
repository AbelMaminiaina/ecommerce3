import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test' });

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

import { sendLateShipmentEmail, sendLowStockEmail, sendPaymentReminderEmail } from './emailService.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SMTP_USER = 'smtp-user';
  process.env.SMTP_PASS = 'smtp-pass';
  process.env.ADMIN_EMAIL = 'admin@example.com';
});
afterEach(() => {
  process.env = { ...originalEnv };
});

const sent = () => sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };

describe('sendPaymentReminderEmail', () => {
  const data = {
    orderNumbers: ['ORD-1', 'ORD-2'],
    companyName: 'Épicerie <b>Rasoa</b>',
    contactEmail: 'rasoa@example.com',
    totalAmount: 100_000,
    expiresAt: new Date('2026-10-14T08:00:00Z'),
    trackingUrl: 'https://tsena.mg/suivi-commande?order=ORD-1&email=rasoa%40example.com',
  };

  it('rappel au client avec le lien de suivi, texte saisi échappé', async () => {
    expect(await sendPaymentReminderEmail(data)).toBe(true);
    expect(sent().to).toBe('rasoa@example.com');
    expect(sent().subject).toBe('⏰ Paiement en attente - ORD-1, ORD-2');
    expect(sent().html).toContain('Épicerie &lt;b&gt;Rasoa&lt;/b&gt;');
    expect(sent().html).toContain('href="https://tsena.mg/suivi-commande?order=ORD-1&amp;email=rasoa%40example.com"');
    expect(sent().html).toContain('elles seront annulées');
  });

  it('sans SMTP : rien n’est envoyé', async () => {
    delete process.env.SMTP_USER;
    expect(await sendPaymentReminderEmail(data)).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendLateShipmentEmail', () => {
  const orders = [{ orderNumber: 'ORD-1', total: 80_000, dueAt: new Date('2026-10-13T10:00:00Z') }];

  it('au vendeur', async () => {
    await sendLateShipmentEmail({ recipientName: 'Ferme Andry', contactEmail: 'andry@example.com', orders, manageUrl: 'https://tsena.mg/vendeur/commandes' });
    expect(sent().to).toBe('andry@example.com');
    expect(sent().subject).toBe('📦 1 commande en retard d\'expédition');
    expect(sent().html).not.toContain('Vendeur');
  });

  it('récapitulatif administrateur avec la colonne vendeur', async () => {
    await sendLateShipmentEmail({
      recipientName: 'Équipe',
      orders: [{ ...orders[0], sellerName: 'Ferme Andry' }, { ...orders[0], orderNumber: 'ORD-2' }],
      manageUrl: 'https://tsena.mg/admin/commandes',
    });
    expect(sent().to).toBe('admin@example.com');
    expect(sent().subject).toBe('📦 2 commandes en retard d\'expédition');
    expect(sent().html).toContain('Vendeur');
    expect(sent().html).toContain('Ferme Andry');
  });
});

describe('sendLowStockEmail', () => {
  it('liste les produits avec la raison de l’alerte', async () => {
    await sendLowStockEmail({
      recipientName: 'Ferme Andry',
      contactEmail: 'andry@example.com',
      products: [
        { name: 'Œufs frais', stockQuantity: 0, unit: 'plateau', moq: 1 },
        { name: 'Provende', stockQuantity: 30, unit: 'sac', moq: 50 },
        { name: 'Cailles', stockQuantity: 3, unit: 'piece', moq: 1 },
      ],
      manageUrl: 'https://tsena.mg/vendeur/produits',
    });
    expect(sent().subject).toBe('📉 Stock bas : 3 produits');
    expect(sent().html).toContain('Sous le minimum de commande (50)');
    expect(sent().html).toContain('Stock bas');
  });
});

describe('dates des e-mails', () => {
  it('à l’heure de Madagascar (UTC+3), quel que soit le fuseau du serveur', async () => {
    await sendPaymentReminderEmail({
      orderNumbers: ['ORD-1'],
      companyName: 'Rasoa',
      contactEmail: 'rasoa@example.com',
      totalAmount: 1000,
      expiresAt: new Date('2026-10-14T05:30:00Z'),
      trackingUrl: 'https://tsena.mg/suivi-commande',
    });
    expect(sent().html).toContain('14 octobre 2026 à 08:30');
  });
});
