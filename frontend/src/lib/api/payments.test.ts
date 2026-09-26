import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPaymentMethods,
  getPaymentStatus,
  submitPayment,
  getAdminPayments,
  confirmPayment,
  rejectPayment,
} from './payments';
import { REFERENCE_PATTERN } from '@/hooks/usePayment';

function mockFetchJson(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('payments API', () => {
  it('lists the configured Mobile Money methods', async () => {
    const fetchMock = mockFetchJson({ methods: [{ id: 'mvola', label: 'MVola', number: '034', accountName: 'Tsena Pro' }] });

    const methods = await getPaymentMethods();

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/payments/methods');
    expect(methods[0].id).toBe('mvola');
  });

  it('queries the payment status with the guest e-mail', async () => {
    const fetchMock = mockFetchJson({ paymentStatus: 'awaiting' });

    await getPaymentStatus('ORD-1', { email: 'jean@example.mg' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3001/api/payments/status?orderNumber=ORD-1&email=jean%40example.mg'
    );
  });

  it('sends the bearer token for a signed-in buyer', async () => {
    const fetchMock = mockFetchJson({ paymentStatus: 'awaiting' });

    await getPaymentStatus('ORD-1', { token: 'jwt' });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer jwt' });
  });

  it('POSTs the transaction reference', async () => {
    const fetchMock = mockFetchJson({ success: true, message: 'ok' });

    await submitPayment({ orderNumber: 'ORD-1', reference: 'MP123456', payerPhone: '034 00 000 00', email: 'a@b.mg' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/payments/submit');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      orderNumber: 'ORD-1',
      reference: 'MP123456',
      payerPhone: '034 00 000 00',
      email: 'a@b.mg',
    });
  });

  it('filters the admin payments by status', async () => {
    const fetchMock = mockFetchJson({ payments: [] });

    await getAdminPayments('jwt', 'paid');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/payments/admin?status=paid');
  });

  it('confirms and rejects a payment through the admin endpoints', async () => {
    const fetchMock = mockFetchJson({ success: true });

    await confirmPayment('o1', 'jwt');
    await rejectPayment('o1', 'Montant incorrect', 'jwt');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/payments/admin/o1/confirm');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3001/api/payments/admin/o1/reject');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ reason: 'Montant incorrect' });
  });
});

describe('REFERENCE_PATTERN', () => {
  it.each(['MP260920.1234.A56789', 'ABCD', 'OM 2026/09-20_x'])('accepts %s', (ref) => {
    expect(REFERENCE_PATTERN.test(ref)).toBe(true);
  });

  it.each(['AB', '', '<script>', 'x'.repeat(61)])('rejects %s', (ref) => {
    expect(REFERENCE_PATTERN.test(ref)).toBe(false);
  });
});
