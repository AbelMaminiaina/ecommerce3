import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { paymentsApi, type PaymentAttempt } from '@tsena/shared';
import { api } from '../../lib/api';

const POLL_INTERVAL_MS = 4000;
const isSafeUrl = (url: unknown): url is string => typeof url === 'string' && /^https:\/\//i.test(url);

// Paiement d'une commande (et des commandes du même panier) — même déroulé que le site (hooks/usePayment.ts) :
//  - MVola, Airtel Money : demande envoyée sur le téléphone du client, qui la confirme ;
//  - Orange Money : page de l'opérateur ouverte dans le navigateur intégré ;
//  - sinon : envoi manuel au numéro marchand puis saisie de la référence.
// Une demande en cours est suivie toutes les 4 s jusqu'à son résultat.
export function usePayment(orderNumber: string, email?: string) {
  const queryClient = useQueryClient();
  const statusKey = ['payment', orderNumber, email ?? null];
  const [startedAttemptId, setStartedAttemptId] = useState<string | null>(null);

  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => paymentsApi.status(api, orderNumber, email),
    networkMode: 'online',
  });

  const pendingId =
    startedAttemptId ?? (status.data?.attempt?.status === 'pending' ? status.data.attempt.id : null);

  const attempt = useQuery({
    queryKey: ['payment-attempt', pendingId],
    queryFn: async (): Promise<PaymentAttempt> => {
      const latest = await paymentsApi.attempt(api, pendingId!, email);
      if (latest.status !== 'pending') {
        setStartedAttemptId(null);
        await queryClient.invalidateQueries({ queryKey: statusKey });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
      return latest;
    },
    enabled: !!pendingId,
    refetchInterval: (query) => (query.state.data?.status === 'pending' || !query.state.data ? POLL_INTERVAL_MS : false),
    networkMode: 'online',
  });

  const openOperatorPage = async (url: string | null | undefined) => {
    if (!isSafeUrl(url)) return false;
    await WebBrowser.openBrowserAsync(url);
    // Retour dans l'application (page fermée) : on vérifie tout de suite le résultat
    queryClient.invalidateQueries({ queryKey: ['payment-attempt'] });
    return true;
  };

  const start = useMutation({
    mutationFn: (payerPhone?: string) =>
      paymentsApi.startAuto(api, { orderNumber, payerPhone: payerPhone?.trim() || undefined, email }),
    onSuccess: async ({ attempt: started }) => {
      setStartedAttemptId(started.id);
      queryClient.setQueryData(['payment-attempt', started.id], started);
      if (started.paymentUrl) await openOperatorPage(started.paymentUrl);
    },
  });

  const submitReference = useMutation({
    mutationFn: (data: { reference: string; payerPhone: string }) =>
      paymentsApi.submitReference(api, {
        orderNumber,
        reference: data.reference.trim(),
        payerPhone: data.payerPhone.trim(),
        email,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusKey }),
  });

  const current = attempt.data ?? status.data?.attempt ?? null;
  const waiting = !!pendingId && (!current || current.status === 'pending');

  return {
    summary: status.data ?? null,
    loading: status.isLoading,
    error: status.error as Error | null,
    refresh: status.refetch,
    instant: status.data?.instant ?? null,
    waiting,
    attempt: current,
    lastFailure: current?.status === 'failed' ? current.failureReason ?? 'Le paiement n’a pas abouti.' : null,
    inReview: current?.status === 'review',
    start,
    /** Rouvre la page d'Orange Money tant que la demande est en cours */
    resume: () => openOperatorPage(current?.status === 'pending' ? current.paymentUrl : null),
    submitReference,
  };
}
