'use client';

import React, { useState } from 'react';
import { confirmReceipt, openDispute, type OrderProtection } from '@/lib/api/orders';
import { useToast } from './Toast';

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

interface OrderProtectionBoxProps {
  orderId: string;
  protection: Partial<OrderProtection>;
  token?: string;
  /** Après une action : recharger les commandes */
  onChange: () => void;
}

// « Paiement garanti » dans le détail d'une commande (Mon compte) : état de la protection, confirmation de la
// réception, signalement d'un problème, décision de l'équipe.
export function OrderProtectionBox({ orderId, protection, token, onChange }: OrderProtectionBoxProps) {
  const { addToast } = useToast();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = protection.protection ?? 'none';

  if (state === 'none') return null;

  const run = async (action: () => Promise<{ message?: string }>) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.message) addToast('success', result.message);
      setReporting(false);
      setReason('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const deadline = protection.disputeDeadline ? dateFr(protection.disputeDeadline) : null;

  return (
    <div className={`protection-box st-${state}`}>
      <div className="protection-head">
        <i
          className={`bi ${
            state === 'disputed' ? 'bi-exclamation-triangle' : state === 'refunded' ? 'bi-arrow-counterclockwise' : 'bi-shield-check'
          }`}
        ></i>
        <div>
          <strong>
            {state === 'protected' && 'Paiement garanti'}
            {state === 'received' && 'Réception confirmée'}
            {state === 'disputed' && 'Problème signalé'}
            {state === 'refunded' && 'Remboursement accordé'}
          </strong>
          <p>
            {state === 'protected' &&
              (protection.deliveredAt
                ? `Le vendeur ne sera payé qu'après votre confirmation. Un problème ? Signalez-le${deadline ? ` avant le ${deadline}` : ''}.`
                : "Votre argent est gardé par Tsena : le vendeur n'est payé qu'une fois votre commande reçue.")}
            {state === 'received' && 'Merci ! Le vendeur va recevoir son paiement.'}
            {state === 'disputed' && 'Notre équipe examine votre signalement et revient vers vous rapidement. Le vendeur n’est pas payé en attendant.'}
            {state === 'refunded' && 'Vous êtes remboursé sur le moyen de paiement utilisé (ou en Mobile Money).'}
          </p>
          {protection.disputeReason && (state === 'disputed' || state === 'refunded') && (
            <p className="protection-quote">« {protection.disputeReason} »</p>
          )}
          {protection.disputeNote && <p className="protection-note"><strong>Réponse de l’équipe :</strong> {protection.disputeNote}</p>}
        </div>
      </div>

      {(protection.canConfirmReceipt || protection.canOpenDispute) && !reporting && (
        <div className="protection-actions">
          {protection.canConfirmReceipt && (
            <button type="button" className="btn-submit" disabled={busy} onClick={() => run(() => confirmReceipt(orderId, token!))}>
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
              <i className="bi bi-check2-circle me-1"></i>J&apos;ai bien reçu ma commande
            </button>
          )}
          {protection.canOpenDispute && (
            <button type="button" className="link-btn text-danger" disabled={busy} onClick={() => setReporting(true)}>
              <i className="bi bi-flag me-1"></i>Signaler un problème
            </button>
          )}
        </div>
      )}

      {reporting && (
        <form
          className="protection-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 10) {
              setError('Décrivez le problème en quelques mots (10 caractères minimum).');
              return;
            }
            run(() => openDispute(orderId, reason.trim(), token!));
          }}
        >
          <label className="form-label" htmlFor={`dispute-${orderId}`}>Que s’est-il passé ?</label>
          <textarea
            id={`dispute-${orderId}`}
            className="form-control"
            rows={3}
            maxLength={1000}
            placeholder="Ex. : colis abîmé, produit manquant, article différent de la description…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <div className="protection-actions">
            <button type="submit" className="btn-submit" disabled={busy}>
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
              Envoyer le signalement
            </button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => setReporting(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {error && <div className="alert alert-danger mt-2 mb-0" role="alert">{error}</div>}
    </div>
  );
}
