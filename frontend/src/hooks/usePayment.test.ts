import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/payments', () => ({
  getPaymentStatus: vi.fn(),
  submitPayment: vi.fn(),
  startAutoPayment: vi.fn(),
  getAutoAttempt: vi.fn(),
}));

import { getAutoAttempt, getPaymentStatus, startAutoPayment, submitPayment } from '@/lib/api/payments';
import { GUEST_EMAIL_KEY, isPayerNumber, usePayment, withFinalPeriod } from './usePayment';

const MVOLA = { provider: 'mvola', label: 'MVola', flow: 'push', phonePrefixes: '034 ou 038', phonePlaceholder: '034 12 345 67' };
const ORANGE = { provider: 'orange_money', label: 'Orange Money', flow: 'redirect', phonePrefixes: '032 ou 037', phonePlaceholder: '032 12 345 67' };
const AIRTEL = { provider: 'airtel_money', label: 'Airtel Money', flow: 'push', phonePrefixes: '033', phonePlaceholder: '033 12 345 67' };

const summary = (overrides: Partial<any> = {}) => ({
  paymentStatus: 'awaiting',
  automatic: true,
  instant: MVOLA,
  attempt: null,
  expiresAt: null,
  cancelReason: null,
  method: 'mvola',
  methodLabel: 'MVola',
  number: '034 00 000 00',
  accountName: 'Tsena Pro',
  totalAmount: 5_200_000,
  reference: null,
  payerPhone: null,
  submittedAt: null,
  paidAt: null,
  rejectionReason: null,
  orders: [{ orderNumber: 'ORD-1', sellerName: null, total: 5_200_000, status: 'pending', paymentStatus: 'awaiting' }],
  ...overrides,
});
const attempt = (overrides: Partial<any> = {}) => ({
  id: 'att-1',
  provider: 'mvola',
  status: 'pending',
  failureReason: null,
  payerPhone: '0343500003',
  paymentUrl: null,
  createdAt: '2026-09-20T10:00:00Z',
  ...overrides,
});
const orangeAttempt = (overrides: Partial<any> = {}) =>
  attempt({ provider: 'orange_money', payerPhone: '', paymentUrl: 'https://webpayment.orange.example/pay/abc', ...overrides });

beforeEach(() => {
  vi.mocked(getPaymentStatus).mockReset();
  vi.mocked(submitPayment).mockReset();
  vi.mocked(startAutoPayment).mockReset();
  vi.mocked(getAutoAttempt).mockReset();
  try {
    sessionStorage.clear();
  } catch {
    // ignoré
  }
});
afterEach(() => {
  vi.useRealTimers();
});

const opts = { email: 'jean@example.mg' };

describe('withFinalPeriod', () => {
  it.each([
    ['Paiement refusé', 'Paiement refusé.'],
    ['Paiement refusé.', 'Paiement refusé.'],
    ['  Délai dépassé (15 min)  ', 'Délai dépassé (15 min).'],
    ['Erreur !', 'Erreur !'],
  ])('%j -> %j', (input, expected) => expect(withFinalPeriod(input)).toBe(expected));
});

describe('isPayerNumber', () => {
  it.each([
    ['mvola', '034 12 345 67', true],
    ['mvola', '+261 38 12 345 67', true],
    ['mvola', '032 12 345 67', false],
    ['mvola', '033 12 345 67', false],
    ['orange_money', '032 12 345 67', true],
    ['orange_money', '037.12.345.67', true],
    ['orange_money', '034 12 345 67', false],
    ['airtel_money', '033 12 345 67', true],
    ['airtel_money', '00261331234567', true],
    ['airtel_money', '032 12 345 67', false],
    ['airtel_money', '033 12', false],
    ['airtel_money', '', false],
  ] as const)('%s : %j -> %s', (provider, input, expected) => expect(isPayerNumber(provider, input)).toBe(expected));
});

describe('usePayment', () => {
  it('charge l’état du paiement et propose le paiement instantané quand le serveur le permet', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary() as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary?.totalAmount).toBe(5_200_000);
    expect(result.current.instant).toMatchObject({
      available: true,
      provider: 'mvola',
      label: 'MVola',
      flow: 'push',
      phonePrefixes: '034 ou 038',
      waiting: false,
      lastFailure: null,
      inReview: false,
    });
    expect(getPaymentStatus).toHaveBeenCalledWith('ORD-1', { email: 'jean@example.mg', token: undefined });
  });

  it('ne propose pas le paiement instantané quand l’opérateur n’est pas configuré côté serveur', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary({ automatic: false, instant: null }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.instant.available).toBe(false);
  });

  it('n’interroge pas l’API tant que l’identité du client n’est pas connue (enabled = false)', async () => {
    renderHook(() => usePayment('ORD-1', { ...opts, enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(getPaymentStatus).not.toHaveBeenCalled();
  });

  it('envoie la demande puis attend la confirmation du client', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary() as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(attempt() as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let started = false;
    await act(async () => {
      started = await result.current.instant.start('034 35 000 03');
    });

    expect(started).toBe(true);
    expect(startAutoPayment).toHaveBeenCalledWith({ orderNumber: 'ORD-1', payerPhone: '034 35 000 03', email: 'jean@example.mg' }, undefined);
    expect(result.current.instant.waiting).toBe(true);
    expect(result.current.instant.payerPhone).toBe('0343500003');
  });

  it('suit la demande toutes les 4 s puis recharge l’état dès que l’opérateur confirme', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus).mockResolvedValueOnce(summary() as any).mockResolvedValue(summary({ paymentStatus: 'paid', automatic: false, instant: null }) as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt)
      .mockResolvedValueOnce(attempt() as any) // 1re vérification : toujours en attente
      .mockResolvedValue(attempt({ status: 'completed' }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.instant.start('034 35 000 03');
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(1600); }); // 1re vérification
    expect(result.current.instant.waiting).toBe(true);
    expect(result.current.summary?.paymentStatus).toBe('awaiting');

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); }); // 2e vérification : confirmé
    await waitFor(() => expect(result.current.summary?.paymentStatus).toBe('paid'));
    expect(result.current.instant.waiting).toBe(false);
    expect(getAutoAttempt).toHaveBeenCalledWith('att-1', { email: 'jean@example.mg', token: undefined });
  });

  it('annonce l’échec avec un point final et permet de réessayer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus).mockResolvedValue(summary() as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(
      attempt({ status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur MVola' }) as any
    );

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.instant.start('034 35 000 04');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });

    await waitFor(() => expect(result.current.instant.waiting).toBe(false));
    expect(result.current.instant.lastFailure).toBe('Paiement refusé, annulé ou expiré sur MVola.');
  });

  it('signale un paiement reçu à vérifier par l’équipe', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus).mockResolvedValue(summary() as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(attempt({ status: 'review' }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.instant.start('034 35 000 06');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });

    await waitFor(() => expect(result.current.instant.inReview).toBe(true));
    expect(result.current.instant.waiting).toBe(false);
  });

  it('reprend une demande en cours après un rechargement de la page (le serveur la connaît)', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary({ paymentStatus: 'submitted', reference: 'MVOLA:1234', attempt: attempt() }) as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(attempt() as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.instant.waiting).toBe(true);
    expect(result.current.instant.payerPhone).toBe('0343500003');
  });

  it('affiche l’erreur du serveur quand la demande est refusée (numéro invalide, service indisponible)', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary() as any);
    vi.mocked(startAutoPayment).mockRejectedValue(new Error('MVola est momentanément indisponible.'));

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let started = true;
    await act(async () => {
      started = await result.current.instant.start('034 35 000 07');
    });

    expect(started).toBe(false);
    expect(result.current.instant.error).toBe('MVola est momentanément indisponible.');
    expect(result.current.instant.waiting).toBe(false);
  });

  it('continue de suivre la demande malgré une erreur réseau passagère', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus).mockResolvedValueOnce(summary() as any).mockResolvedValue(summary({ paymentStatus: 'paid' }) as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt)
      .mockRejectedValueOnce(new Error('réseau coupé'))
      .mockResolvedValue(attempt({ status: 'completed' }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.instant.start('034 35 000 03');
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(result.current.instant.waiting).toBe(true); // l'erreur n'interrompt pas le suivi
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });

    await waitFor(() => expect(result.current.summary?.paymentStatus).toBe('paid'));
  });

  it('garde le paiement manuel par référence : envoi puis état rechargé', async () => {
    vi.mocked(getPaymentStatus)
      .mockResolvedValueOnce(summary({ automatic: false, instant: null }) as any)
      .mockResolvedValue(summary({ automatic: false, instant: null, paymentStatus: 'submitted', reference: 'MP123456' }) as any);
    vi.mocked(submitPayment).mockResolvedValue({ success: true, message: 'ok' } as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit(' MP123456 ', ' 034 11 111 11 ');
    });

    expect(ok).toBe(true);
    expect(submitPayment).toHaveBeenCalledWith({ orderNumber: 'ORD-1', reference: 'MP123456', payerPhone: '034 11 111 11', email: 'jean@example.mg' }, undefined);
    expect(result.current.summary?.paymentStatus).toBe('submitted');
  });
});

describe('usePayment : Airtel Money (demande sur le téléphone, préfixe 033)', () => {
  it('expose le fonctionnement Airtel et envoie la demande comme MVola', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(summary({ method: 'airtel_money', methodLabel: 'Airtel Money', instant: AIRTEL }) as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: attempt({ provider: 'airtel_money', payerPhone: '0333500003' }), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(attempt({ provider: 'airtel_money', payerPhone: '0333500003' }) as any);
    const navigate = vi.fn();

    const { result } = renderHook(() => usePayment('ORD-1', { ...opts, navigate }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.instant).toMatchObject({ provider: 'airtel_money', label: 'Airtel Money', flow: 'push', phonePrefixes: '033' });

    await act(async () => {
      await result.current.instant.start('033 35 000 03');
    });

    expect(startAutoPayment).toHaveBeenCalledWith({ orderNumber: 'ORD-1', payerPhone: '033 35 000 03', email: 'jean@example.mg' }, undefined);
    expect(result.current.instant.waiting).toBe(true);
    expect(navigate).not.toHaveBeenCalled(); // pas de redirection : la confirmation se fait sur le téléphone
  });
});

describe('usePayment : Orange Money (redirection vers la page d’Orange)', () => {
  const orangeSummary = (overrides: Partial<any> = {}) => summary({ method: 'orange_money', methodLabel: 'Orange Money', instant: ORANGE, ...overrides });

  it('n’envoie aucun numéro et redirige le client vers la page de paiement d’Orange', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(orangeSummary() as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: orangeAttempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(orangeAttempt() as any);
    const navigate = vi.fn();

    const { result } = renderHook(() => usePayment('ORD-1', { ...opts, navigate }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.instant).toMatchObject({ provider: 'orange_money', flow: 'redirect' });

    let started = false;
    await act(async () => {
      started = await result.current.instant.start();
    });

    expect(started).toBe(true);
    expect(startAutoPayment).toHaveBeenCalledWith({ orderNumber: 'ORD-1', payerPhone: undefined, email: 'jean@example.mg' }, undefined);
    expect(navigate).toHaveBeenCalledWith('https://webpayment.orange.example/pay/abc');
    expect(result.current.instant.waiting).toBe(true);
  });

  it('garde l’e-mail du visiteur le temps de l’aller-retour (l’adresse de retour ne le contient pas)', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(orangeSummary() as any);
    vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: orangeAttempt(), message: 'ok' } as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(orangeAttempt() as any);

    const { result } = renderHook(() => usePayment('ORD-1', { ...opts, navigate: vi.fn() }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.instant.start();
    });

    expect(sessionStorage.getItem(GUEST_EMAIL_KEY)).toBe('jean@example.mg');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://exemple.mg/x', '//evil.example/x'])(
    'refuse de rediriger vers une adresse non http(s) : %s',
    async (paymentUrl) => {
      vi.mocked(getPaymentStatus).mockResolvedValue(orangeSummary() as any);
      vi.mocked(startAutoPayment).mockResolvedValue({ success: true, reused: false, attempt: orangeAttempt({ paymentUrl }), message: 'ok' } as any);
      const navigate = vi.fn();

      const { result } = renderHook(() => usePayment('ORD-1', { ...opts, navigate }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      let started = true;
      await act(async () => {
        started = await result.current.instant.start();
      });

      expect(started).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(result.current.instant.error).toContain('manuellement');
    }
  );

  it('reprend le suivi au retour de la page d’Orange et permet de rouvrir cette page tant que rien n’est confirmé', async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue(orangeSummary({ paymentStatus: 'submitted', reference: 'ORANGE_MONEY:1234', attempt: orangeAttempt() }) as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(orangeAttempt() as any);
    const navigate = vi.fn();

    const { result } = renderHook(() => usePayment('ORD-1', { ...opts, navigate }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.instant.waiting).toBe(true);
    expect(result.current.instant.paymentUrl).toBe('https://webpayment.orange.example/pay/abc');
    act(() => {
      result.current.instant.resume();
    });
    expect(navigate).toHaveBeenCalledWith('https://webpayment.orange.example/pay/abc');
  });

  it('confirme automatiquement au retour dès qu’Orange a validé le paiement', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus)
      .mockResolvedValueOnce(orangeSummary({ paymentStatus: 'submitted', reference: 'ORANGE_MONEY:1234', attempt: orangeAttempt() }) as any)
      .mockResolvedValue(orangeSummary({ paymentStatus: 'paid', automatic: false, instant: null }) as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(orangeAttempt({ status: 'completed', paymentUrl: null }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });

    await waitFor(() => expect(result.current.summary?.paymentStatus).toBe('paid'));
    expect(result.current.instant.waiting).toBe(false);
  });

  it('ne propose plus la page d’Orange une fois la demande échouée (le client peut relancer un paiement)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPaymentStatus).mockResolvedValue(orangeSummary({ paymentStatus: 'submitted', reference: 'ORANGE_MONEY:1234', attempt: orangeAttempt() }) as any);
    vi.mocked(getAutoAttempt).mockResolvedValue(orangeAttempt({ status: 'failed', failureReason: 'Paiement refusé, annulé ou expiré sur Orange Money' }) as any);

    const { result } = renderHook(() => usePayment('ORD-1', opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });

    await waitFor(() => expect(result.current.instant.waiting).toBe(false));
    expect(result.current.instant.paymentUrl).toBeNull();
    expect(result.current.instant.lastFailure).toBe('Paiement refusé, annulé ou expiré sur Orange Money.');
  });
});
