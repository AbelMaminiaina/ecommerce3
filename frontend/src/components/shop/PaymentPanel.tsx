'use client';

import React, { useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { usePayment, isPayerNumber, REFERENCE_PATTERN } from '@/hooks/usePayment';
import { PAYMENT_STATUS_LABELS } from '@/lib/api/payments';
import { useToast } from '@/components/shop/Toast';

interface PaymentPanelProps {
  orderNumber: string;
  email?: string;
  token?: string;
  enabled?: boolean;
}

// Date limite lisible, et alerte quand il reste moins de 6 heures
function formatDeadline(iso: string): { text: string; urgent: boolean } {
  const date = new Date(iso);
  return {
    text: date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }),
    urgent: date.getTime() - Date.now() < 6 * 60 * 60 * 1000,
  };
}

const STATUS_STYLE = {
  awaiting: { badge: 'bg-warning text-dark', icon: 'bi-hourglass-split' },
  submitted: { badge: 'bg-info text-dark', icon: 'bi-search' },
  paid: { badge: 'bg-success', icon: 'bi-check-circle-fill' },
  rejected: { badge: 'bg-danger', icon: 'bi-exclamation-triangle-fill' },
} as const;

// Code USSD pour retrouver la demande depuis le téléphone (quand la notification n'apparaît pas)
const USSD_CODE: Partial<Record<string, string>> = { mvola: '#111#' };

// Paiement Mobile Money d'une commande (Bootstrap, thème ShopWise).
//  - « instantané » quand l'API de l'opérateur est configurée : MVola et Airtel Money (le client saisit son numéro et
//    confirme sur son téléphone) ou Orange Money (le client paie sur la page d'Orange) ; la page se met à jour toute
//    seule à la confirmation ;
//  - sinon (ou au choix du client) : envoi manuel au numéro marchand puis saisie de la référence de transaction.
export function PaymentPanel({ orderNumber, email, token, enabled = true }: PaymentPanelProps) {
  const { addToast } = useToast();
  const { summary, loading, submitting, error, refresh, submit, instant } = usePayment(orderNumber, { email, token, enabled });
  const [reference, setReference] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [instantPhone, setInstantPhone] = useState('');

  if (loading && !summary && !instant.waiting) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Chargement…</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="alert alert-warning" role="alert">
        {error ?? 'Paiement introuvable.'}
      </div>
    );
  }

  const style = STATUS_STYLE[summary.paymentStatus];
  const referenceValid = REFERENCE_PATTERN.test(reference.trim());
  const canSubmit = referenceValid && payerPhone.trim().length >= 6 && !submitting;
  const cancelledOnly = summary.orders.every((o) => o.status === 'cancelled');
  const isPush = instant.flow === 'push';
  const instantPhoneValid = instant.provider ? isPayerNumber(instant.provider, instantPhone) : false;
  const canStart = !instant.starting && (isPush ? instantPhoneValid : true);
  const showAuto = instant.available && (mode === 'auto' || instant.waiting || instant.inReview);
  // Référence « MVOLA:… », « ORANGE_MONEY:… » = paiement lancé par l'API (pas une référence saisie par le client)
  const manualReferenceSent = summary.paymentStatus === 'submitted' && !/^[A-Z_]+:/.test(summary.reference ?? '');
  const ussd = instant.provider ? USSD_CODE[instant.provider] : undefined;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    addToast('info', 'Numéro copié');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (await submit(reference, payerPhone)) {
      setReference('');
      addToast('success', 'Référence envoyée : votre paiement va être vérifié');
    }
  };

  const handleInstant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart) return;
    await instant.start(isPush ? instantPhone : undefined);
  };

  return (
    <div className="border rounded p-4 mb-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h4 className="mb-0">
          <i className="bi bi-phone text-primary me-2"></i>Paiement {summary.methodLabel ?? 'Mobile Money'}
        </h4>
        <span className={`badge rounded-pill py-2 px-3 ${style.badge}`}>
          <i className={`bi ${style.icon} me-1`}></i>
          {PAYMENT_STATUS_LABELS[summary.paymentStatus]}
        </span>
      </div>

      {summary.orders.length > 1 && (
        <ul className="list-unstyled small mb-3">
          {summary.orders.map((o) => (
            <li key={o.orderNumber} className="d-flex justify-content-between">
              <span>
                {o.orderNumber}
                {o.sellerName ? ` — ${o.sellerName}` : ''}
              </span>
              <span>{formatPrice(o.total)}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.demo && !cancelledOnly && summary.paymentStatus !== 'paid' && (
        <div className="alert alert-warning small" role="note" data-testid="demo-banner">
          <i className="bi bi-bug me-2"></i>
          <strong>Paiement de démonstration.</strong> MVola, Orange Money et Airtel Money sont simulés : aucun argent n&apos;est
          débité. Avec MVola ou Airtel Money, tout numéro valide « confirme » après quelques secondes ; pour simuler un refus,
          utilisez le 034 35 000 04 (MVola) ou le 033 35 000 04 (Airtel Money). Avec Orange Money, choisissez « Payer » ou
          « Annuler » sur la page simulée.
        </div>
      )}

      {cancelledOnly ? (
        <div className="alert alert-secondary mb-0">
          Cette commande a été annulée{summary.cancelReason ? ` (${summary.cancelReason.toLowerCase()})` : ''} : aucun paiement n&apos;est attendu.
        </div>
      ) : summary.paymentStatus === 'paid' ? (
        <div className="alert alert-success mb-0">
          <strong>Paiement confirmé.</strong> Merci ! Votre commande est en cours de traitement.
        </div>
      ) : (
        <>
          {summary.paymentStatus === 'rejected' && (
            <div className="alert alert-danger" role="alert">
              <strong>Nous n&apos;avons pas pu valider votre paiement.</strong>
              {summary.rejectionReason && <div>Motif : {summary.rejectionReason}</div>}
              <div>Vérifiez votre transaction puis saisissez de nouveau la référence ci-dessous.</div>
            </div>
          )}

          {manualReferenceSent && (
            <div className="alert alert-info" role="status">
              Référence <strong>{summary.reference}</strong> reçue : nous vérifions votre paiement. Vous serez prévenu
              par e-mail. Vous pouvez la corriger ci-dessous en cas d&apos;erreur.
            </div>
          )}

          {summary.expiresAt && !instant.waiting && !instant.inReview && (
            <div className={`alert ${formatDeadline(summary.expiresAt).urgent ? 'alert-danger' : 'alert-warning'}`} role="status">
              <i className="bi bi-clock me-2"></i>À régler avant le <strong>{formatDeadline(summary.expiresAt).text}</strong>. Passé ce
              délai, la commande est annulée automatiquement.
            </div>
          )}

          {showAuto ? (
            instant.waiting ? (
              isPush ? (
                <div className="bg-light rounded p-4 mb-3 text-center" role="status" aria-live="polite">
                  <div className="spinner-border text-primary mb-3" aria-hidden="true"></div>
                  <h5 className="text-dark">Confirmez sur votre téléphone</h5>
                  <p className="mb-2">
                    Une demande de paiement de <strong className="text-primary">{formatPrice(summary.totalAmount)}</strong> a été
                    envoyée au <strong className="text-dark">{instant.payerPhone}</strong>.
                  </p>
                  <p className="mb-2">
                    Ouvrez la notification {instant.label}
                    {ussd ? (
                      <>
                        {' '}(ou composez <strong>{ussd}</strong>)
                      </>
                    ) : null}{' '}
                    et validez avec votre code secret.
                  </p>
                  <small>Cette page se met à jour toute seule dès que le paiement est confirmé.</small>
                </div>
              ) : (
                <div className="bg-light rounded p-4 mb-3 text-center" role="status" aria-live="polite">
                  <div className="spinner-border text-primary mb-3" aria-hidden="true"></div>
                  <h5 className="text-dark">Paiement en cours chez {instant.label}</h5>
                  <p className="mb-2">
                    Terminez le paiement de <strong className="text-primary">{formatPrice(summary.totalAmount)}</strong> sur la
                    page sécurisée d&apos;{instant.label}.
                  </p>
                  <small className="d-block mb-3">Cette page se met à jour toute seule dès que le paiement est confirmé.</small>
                  {instant.paymentUrl && (
                    <button type="button" className="btn btn-primary rounded-pill py-2 px-4" onClick={instant.resume}>
                      <i className="bi bi-box-arrow-up-right me-2"></i>Reprendre le paiement
                    </button>
                  )}
                </div>
              )
            ) : instant.inReview ? (
              <div className="alert alert-info" role="status">
                <strong>Paiement reçu.</strong> Notre équipe le vérifie : vous serez prévenu par e-mail dès sa validation.
              </div>
            ) : (
              <form onSubmit={handleInstant} className="bg-light rounded p-4 mb-3">
                <p className="text-dark fw-bold mb-1">
                  <i className="bi bi-lightning-charge-fill text-primary me-2"></i>Payer maintenant avec {instant.label}
                </p>
                <p className="small mb-3">
                  {isPush ? (
                    <>
                      Saisissez votre numéro {instant.label} : vous recevrez une demande de paiement de{' '}
                      <strong>{formatPrice(summary.totalAmount)}</strong> à confirmer avec votre code secret. Aucune référence à
                      recopier.
                    </>
                  ) : (
                    <>
                      Vous serez redirigé vers la page sécurisée d&apos;{instant.label} pour payer{' '}
                      <strong>{formatPrice(summary.totalAmount)}</strong> avec votre numéro et votre code secret, puis ramené ici.
                      Aucune référence à recopier.
                    </>
                  )}
                </p>
                {instant.lastFailure && (
                  <div className="alert alert-warning py-2" role="alert">
                    {instant.lastFailure} Vous pouvez réessayer.
                  </div>
                )}
                {isPush ? (
                  <>
                    <label htmlFor="instant-phone" className="form-label text-dark">Votre numéro {instant.label} *</label>
                    <div className="d-flex flex-wrap gap-2">
                      <input
                        id="instant-phone"
                        type="tel"
                        className={`form-control py-3 flex-grow-1 sw-max-280${instantPhone && !instantPhoneValid ? ' is-invalid' : ''}`}
                        value={instantPhone}
                        onChange={(e) => setInstantPhone(e.target.value)}
                        placeholder={instant.phonePlaceholder}
                        maxLength={30}
                        autoComplete="tel"
                        required
                      />
                      <button type="submit" className="btn btn-primary rounded-pill py-3 px-4" disabled={!canStart}>
                        {instant.starting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                        Payer {formatPrice(summary.totalAmount)}
                      </button>
                    </div>
                    {instantPhone && !instantPhoneValid && (
                      <div className="text-danger small mt-1">
                        Numéro {instant.label} invalide : il commence par {instant.phonePrefixes}.
                      </div>
                    )}
                  </>
                ) : (
                  <button type="submit" className="btn btn-primary rounded-pill py-3 px-4" disabled={!canStart}>
                    {instant.starting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                    Payer {formatPrice(summary.totalAmount)} avec {instant.label}
                  </button>
                )}
                {instant.error && <div className="alert alert-danger mt-3 mb-0" role="alert">{instant.error}</div>}
                <button type="button" className="btn btn-link p-0 mt-3 text-decoration-none d-block" onClick={() => setMode('manual')}>
                  Payer autrement : envoyer l&apos;argent moi-même et saisir la référence
                </button>
              </form>
            )
          ) : (
            <>
              {instant.available && (
                <button type="button" className="btn btn-link p-0 mb-3 text-decoration-none" onClick={() => setMode('auto')}>
                  <i className="bi bi-lightning-charge-fill me-1"></i>Revenir au paiement instantané {instant.label}
                </button>
              )}

              <div className="bg-light rounded p-3 mb-4">
                <p className="text-dark fw-bold mb-2">Comment payer</p>
                <ol className="mb-3 ps-3">
                  <li>
                    Ouvrez <strong>{summary.methodLabel}</strong> sur votre téléphone.
                  </li>
                  <li>
                    Envoyez exactement <strong className="text-primary">{formatPrice(summary.totalAmount)}</strong> au
                    numéro ci-dessous.
                  </li>
                  <li>Notez la référence de la transaction (reçue par SMS) et saisissez-la ici.</li>
                </ol>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 bg-white border rounded p-3">
                  <div>
                    <small className="d-block">Numéro {summary.methodLabel}</small>
                    <span className="fs-4 fw-bold text-dark">{summary.number ?? 'Indisponible'}</span>
                    {summary.accountName && <small className="d-block">Bénéficiaire : {summary.accountName}</small>}
                  </div>
                  {summary.number && (
                    <button
                      type="button"
                      className="btn btn-md-square rounded-circle bg-white border"
                      onClick={() => copy(summary.number!)}
                      aria-label="Copier le numéro"
                    >
                      <i className="bi bi-copy"></i>
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label htmlFor="pay-ref" className="form-label text-dark">Référence de la transaction *</label>
                    <input
                      id="pay-ref"
                      className={`form-control py-3${reference && !referenceValid ? ' is-invalid' : ''}`}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Ex. MP260920.1234.A56789"
                      maxLength={60}
                      autoComplete="off"
                      required
                    />
                    <div className="invalid-feedback">4 à 60 caractères (lettres, chiffres, . - _ /).</div>
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="pay-phone" className="form-label text-dark">Numéro utilisé pour payer *</label>
                    <input
                      id="pay-phone"
                      type="tel"
                      className="form-control py-3"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      placeholder="034 00 000 00"
                      maxLength={30}
                      autoComplete="tel"
                      required
                    />
                  </div>
                </div>
                {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
                <div className="d-flex flex-wrap gap-2 mt-4">
                  <button type="submit" className="btn btn-primary rounded-pill py-3 px-5" disabled={!canSubmit}>
                    {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                    {manualReferenceSent ? 'Corriger la référence' : 'J’ai payé, envoyer la référence'}
                  </button>
                  <button type="button" className="btn btn-light rounded-pill py-3 px-4" onClick={refresh} disabled={loading}>
                    <i className="bi bi-arrow-repeat me-2"></i>Actualiser
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
