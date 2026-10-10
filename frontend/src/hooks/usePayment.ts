'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAutoAttempt,
  getPaymentStatus,
  startAutoPayment,
  submitPayment,
  type PaymentAttempt,
  type PaymentMethodId,
  type PaymentSummary,
} from '@/lib/api/payments';

// Référence de transaction Mobile Money : mêmes règles que le serveur (4 à 60 caractères)
export const REFERENCE_PATTERN = /^[A-Za-z0-9._\-/ ]{4,60}$/;

// Numéros de mobile malgaches par opérateur : MVola (034, 038), Orange Money (032, 037), Airtel Money (033)
// (la carte bancaire et PayPal ne demandent pas de numéro)
const PHONE_PATTERNS: Partial<Record<PaymentMethodId, RegExp>> = {
  mvola: /^03[48]\d{7}$/,
  orange_money: /^03[27]\d{7}$/,
  airtel_money: /^033\d{7}$/,
};

// Formats acceptés : « 034 12 345 67 », « +261 34 12 345 67 », « 0341234567 »…
export function isPayerNumber(provider: PaymentMethodId, input: string): boolean {
  let digits = input.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+261')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('00261')) digits = '0' + digits.slice(5);
  else if (digits.startsWith('261') && digits.length === 12) digits = '0' + digits.slice(3);
  return PHONE_PATTERNS[provider]?.test(digits) ?? false;
}

export const isMvolaNumber = (input: string) => isPayerNumber('mvola', input);

// Le motif du serveur n'a pas de point final : on l'ajoute pour pouvoir enchaîner une autre phrase à l'écran
export function withFinalPeriod(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 36 * 60 * 1000; // la demande expire côté serveur au bout de 15 min (30 à 35 min sur la page d'un prestataire)

// E-mail du visiteur sans compte, gardé le temps d'un aller-retour sur la page de l'opérateur (l'adresse de retour
// ne le contient pas : elle transite par l'opérateur). Lu par la page de confirmation au retour.
export const GUEST_EMAIL_KEY = 'all:payment-guest-email';

function rememberGuestEmail(email: string | undefined) {
  try {
    if (email) sessionStorage.setItem(GUEST_EMAIL_KEY, email);
  } catch {
    // stockage indisponible (navigation privée) : le visiteur ressaisira son e-mail
  }
}

const isSafeUrl = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url);

interface UsePaymentOptions {
  /** E-mail saisi à la commande (visiteur sans compte) */
  email?: string;
  /** Jeton du client connecté */
  token?: string;
  /** Attendre que l'identité soit connue (session chargée) avant d'interroger l'API */
  enabled?: boolean;
  /** Redirection vers la page de l'opérateur (remplaçable dans les tests) */
  navigate?: (url: string) => void;
}

const defaultNavigate = (url: string) => window.location.assign(url);

// État du paiement d'une commande (et des commandes de son panier), envoi manuel de la référence, et paiement
// instantané par l'API de l'opérateur : demande sur le téléphone du client (MVola, Airtel Money) ou page de
// paiement de l'opérateur (Orange Money), puis suivi jusqu'à la confirmation.
export function usePayment(orderNumber: string | null, { email, token, enabled = true, navigate = defaultNavigate }: UsePaymentOptions) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Paiement instantané par l'API de l'opérateur ---
  const [startedAttemptId, setStartedAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [starting, setStarting] = useState(false);
  const [instantError, setInstantError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orderNumber || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await getPaymentStatus(orderNumber, { email, token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger le paiement');
    } finally {
      setLoading(false);
    }
  }, [orderNumber, email, token, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(
    async (reference: string, payerPhone: string): Promise<boolean> => {
      if (!orderNumber) return false;
      setSubmitting(true);
      setError(null);
      try {
        await submitPayment({ orderNumber, reference: reference.trim(), payerPhone: payerPhone.trim(), email }, token);
        setSummary(await getPaymentStatus(orderNumber, { email, token }));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible d’enregistrer la référence');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [orderNumber, email, token]
  );

  // Redirection vers la page de paiement du prestataire (Orange Money, Stripe, PayPal)
  const goToOperator = useCallback(
    (url: string | null | undefined): boolean => {
      if (!isSafeUrl(url)) return false;
      rememberGuestEmail(email);
      navigate(url);
      return true;
    },
    [email, navigate]
  );

  // Lance le paiement : demande envoyée sur le téléphone du client, ou redirection vers l'opérateur
  const start = useCallback(
    async (payerPhone?: string): Promise<boolean> => {
      if (!orderNumber) return false;
      setStarting(true);
      setInstantError(null);
      try {
        const result = await startAutoPayment({ orderNumber, payerPhone: payerPhone?.trim() || undefined, email }, token);
        setAttempt(result.attempt);
        setStartedAttemptId(result.attempt.id);
        if (result.attempt.paymentUrl && !goToOperator(result.attempt.paymentUrl)) {
          setInstantError('Adresse de paiement invalide. Payez manuellement avec une référence.');
          return false;
        }
        return true;
      } catch (err) {
        setInstantError(err instanceof Error ? err.message : 'Impossible d’envoyer la demande de paiement');
        return false;
      } finally {
        setStarting(false);
      }
    },
    [orderNumber, email, token, goToOperator]
  );

  // Demande en cours : lancée ici, ou reprise après un rechargement de la page / un retour de l'opérateur
  const pollingId = startedAttemptId ?? (summary?.attempt?.status === 'pending' ? summary.attempt.id : null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!pollingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const latest = await getAutoAttempt(pollingId, { email, token });
        if (cancelled) return;
        setAttempt(latest);
        if (latest.status !== 'pending') {
          setStartedAttemptId(null);
          await refreshRef.current(); // la commande est passée « payée » (ou de nouveau « à payer »)
          return;
        }
      } catch {
        // erreur réseau passagère : on réessaie au prochain passage
      }
      if (Date.now() - startedAt < POLL_MAX_MS) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, 1500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollingId, email, token]);

  const current = attempt ?? summary?.attempt ?? null;
  const waiting = !!pollingId && (current === null || current.status === 'pending');
  const paymentUrl = current?.status === 'pending' && isSafeUrl(current.paymentUrl) ? current.paymentUrl : null;

  return {
    summary,
    loading,
    submitting,
    error,
    refresh,
    submit,
    instant: {
      /** Paiement instantané proposé pour ce panier */
      available: !!summary?.instant,
      provider: summary?.instant?.provider ?? null,
      /** Nom du prestataire (« MVola », « Orange Money », « Airtel Money », « Stripe », « PayPal ») */
      label: summary?.instant?.label ?? summary?.methodLabel ?? 'Mobile Money',
      /** push : le client confirme sur son téléphone ; redirect : il paie sur la page de l'opérateur */
      flow: summary?.instant?.flow ?? 'push',
      /** Mobile Money, ou paiement en ligne uniquement (carte bancaire, PayPal : pas de paiement manuel) */
      kind: summary?.instant?.kind ?? 'mobile_money',
      phonePrefixes: summary?.instant?.phonePrefixes ?? '',
      phonePlaceholder: summary?.instant?.phonePlaceholder ?? '03X XX XXX XX',
      /** Demande en cours : le client doit confirmer (téléphone) ou terminer le paiement (page de l'opérateur) */
      waiting,
      starting,
      error: instantError,
      payerPhone: current?.payerPhone || null,
      /** Page de paiement de l'opérateur à (re)ouvrir tant que la demande est en cours (Orange Money) */
      paymentUrl,
      /** Motif du dernier échec (refus, expiration) ; null si aucun */
      lastFailure: current?.status === 'failed' ? withFinalPeriod(current.failureReason ?? 'Le paiement n’a pas abouti') : null,
      /** L'opérateur a débité le client mais un écart demande une vérification par notre équipe */
      inReview: current?.status === 'review',
      start,
      /** Rouvre la page de paiement de l'opérateur (retour arrière du navigateur, onglet fermé…) */
      resume: () => goToOperator(paymentUrl),
    },
  };
}
