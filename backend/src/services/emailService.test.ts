import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test' });
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

import {
  sendOrderConfirmationEmail,
  sendAdminNotificationEmail,
  sendOrderCancellationEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
} from './emailService.js';

const baseOrder = {
  orderNumber: 'ORD-TEST123',
  companyName: 'Grossiste Test SARL',
  contactEmail: 'jean@example.com',
  contactPhone: '0340000000',
  address: {
    street: '12 rue des Champs',
    city: 'Antananarivo',
    postalCode: '101',
    country: 'Madagascar',
  },
  deliveryMethod: 'standard',
  items: [{ name: 'Carton emballage', quantity: 2, price: 15000 }],
  subtotal: 30000,
  shippingCost: 25000,
  total: 55000,
  status: 'pending',
  payment: {
    methodLabel: 'MVola',
    number: '034 00 000 00',
    accountName: 'Tsena',
    totalToPay: 55000,
  },
  createdAt: new Date('2026-01-01T10:00:00Z'),
};

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

describe('sendOrderConfirmationEmail', () => {
  it('skips sending when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendOrderConfirmationEmail(baseOrder);

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends both a customer and an admin email', async () => {
    const result = await sendOrderConfirmationEmail(baseOrder);

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it('includes the order number, total and Mobile Money instructions in the customer email', async () => {
    await sendOrderConfirmationEmail(baseOrder);

    const customerCall = sendMailMock.mock.calls[0][0];
    expect(customerCall.to).toBe('jean@example.com');
    expect(customerCall.subject).toContain('ORD-TEST123');
    expect(customerCall.subject).toContain('En attente de paiement');
    expect(customerCall.html).toContain('ORD-TEST123');
    expect(customerCall.html).toContain('MVola');
    expect(customerCall.html).toContain('034 00 000 00');
    expect(customerCall.html).not.toContain('Facture');
    expect(customerCall.html).toMatch(/55\s000\sAr/);
  });

  it('shows the payment deadline and the automatic cancellation warning', async () => {
    await sendOrderConfirmationEmail({ ...baseOrder, payment: { ...baseOrder.payment, expiresAt: new Date('2026-09-22T10:00:00Z') } });

    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain('À régler avant le');
    expect(html).toContain('annulée automatiquement');
  });

  it('omits the deadline line when the automatic cancellation is disabled', async () => {
    await sendOrderConfirmationEmail(baseOrder);

    expect(sendMailMock.mock.calls[0][0].html).not.toContain('À régler avant le');
  });

  it('returns false and does not throw when sendMail rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('smtp error'));

    const result = await sendOrderConfirmationEmail(baseOrder);

    expect(result).toBe(false);
  });

  it('shows a reservation notice and date for an item with a future availableFrom', async () => {
    await sendOrderConfirmationEmail({
      ...baseOrder,
      items: [
        { name: 'Palette vif', quantity: 1, price: 30000, availableFrom: '2099-12-20' },
        { name: 'Carton emballage', quantity: 2, price: 2000 },
      ],
    });

    const customerHtml = sendMailMock.mock.calls[0][0].html;
    expect(customerHtml).toContain('Votre commande contient une réservation');
    expect(customerHtml).toMatch(/Réservation — livraison à partir du 20 décembre 2099/);
  });

  it('does not show a reservation notice when the availability date is in the past', async () => {
    await sendOrderConfirmationEmail({
      ...baseOrder,
      items: [{ name: 'Carton emballage', quantity: 1, price: 30000, availableFrom: '2000-01-01' }],
    });

    const customerHtml = sendMailMock.mock.calls[0][0].html;
    expect(customerHtml).not.toContain('contient une réservation');
    expect(customerHtml).not.toContain('livraison à partir du');
  });

  it('shows "Retrait sur place" when there is no shipping address', async () => {
    await sendOrderConfirmationEmail({ ...baseOrder, address: null });

    const customerHtml = sendMailMock.mock.calls[0][0].html;
    expect(customerHtml).toContain('Retrait sur place');
  });
});

describe('sendAdminNotificationEmail', () => {
  it('sends the notification to the configured admin address', async () => {
    const result = await sendAdminNotificationEmail(baseOrder);

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com' })
    );
  });

  it('lists every ordered item and the payment method in the notification body', async () => {
    await sendAdminNotificationEmail({
      ...baseOrder,
      items: [
        { name: 'Carton emballage', quantity: 2, price: 15000 },
        { name: 'Ramette papier', quantity: 3, price: 2000 },
      ],
    });

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).toContain('Carton emballage x2');
    expect(call.html).toContain('Ramette papier x3');
    expect(call.html).toContain('MVola');
  });

  it('flags a reservation item in the admin notification body', async () => {
    await sendAdminNotificationEmail({
      ...baseOrder,
      items: [{ name: 'Palette vif', quantity: 1, price: 30000, availableFrom: '2099-12-20' }],
    });

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).toMatch(/réservation — dispo le 20 décembre 2099/);
  });

  it('skips sending when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendAdminNotificationEmail(baseOrder);

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendOrderCancellationEmail', () => {
  const cancellation = {
    orderNumber: 'ORD-CANCEL',
    companyName: 'Grossiste Test SARL',
    contactEmail: 'jean@example.com',
    reason: 'Rupture de stock',
    items: [{ name: 'Carton emballage', quantity: 2, price: 15000 }],
    total: 30000,
    cancelledAt: new Date('2026-01-02T10:00:00Z'),
  };

  it('skips sending when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendOrderCancellationEmail(cancellation);

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends the cancellation email to the company with the order number and reason', async () => {
    const result = await sendOrderCancellationEmail(cancellation);

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jean@example.com');
    expect(call.subject).toContain('ORD-CANCEL');
    expect(call.html).toContain('ORD-CANCEL');
    expect(call.html).toContain('Rupture de stock');
  });

  it('omits the reason block when no reason is given', async () => {
    await sendOrderCancellationEmail({ ...cancellation, reason: undefined });

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).not.toContain('MOTIF DE L');
  });

  it('returns false and does not throw when sendMail rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('smtp error'));

    const result = await sendOrderCancellationEmail(cancellation);

    expect(result).toBe(false);
  });
});

const statusUpdate = {
  orderNumber: 'ORD-SHIP1',
  companyName: 'Grossiste Test SARL',
  contactEmail: 'jean@example.com',
  items: [{ name: 'Carton emballage', quantity: 2, price: 15000 }],
  total: 30000,
  deliveryMethod: 'express',
  address: {
    street: '12 rue des Champs',
    city: 'Antananarivo',
    postalCode: '101',
    country: 'Madagascar',
  },
  updatedAt: new Date('2026-01-03T10:00:00Z'),
};

describe('sendOrderShippedEmail', () => {
  it('skips sending when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendOrderShippedEmail(statusUpdate);

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends the shipped email with the order number and delivery method', async () => {
    const result = await sendOrderShippedEmail(statusUpdate);

    expect(result).toBe(true);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jean@example.com');
    expect(call.subject).toContain('ORD-SHIP1');
    expect(call.html).toContain('ORD-SHIP1');
    expect(call.html).toContain('Livraison express');
  });

  it('returns false and does not throw when sendMail rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('smtp error'));

    const result = await sendOrderShippedEmail(statusUpdate);

    expect(result).toBe(false);
  });
});

describe('sendOrderDeliveredEmail', () => {
  it('skips sending when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendOrderDeliveredEmail(statusUpdate);

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends the delivered email with the order number', async () => {
    const result = await sendOrderDeliveredEmail(statusUpdate);

    expect(result).toBe(true);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jean@example.com');
    expect(call.subject).toContain('ORD-SHIP1');
    expect(call.html).toContain('ORD-SHIP1');
  });

  it('returns false and does not throw when sendMail rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('smtp error'));

    const result = await sendOrderDeliveredEmail(statusUpdate);

    expect(result).toBe(false);
  });
});
