'use client';

import React, { useEffect, useRef, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { previewPromo, type PromoPreview } from '@/lib/api/promo';
import { storedReferral } from '@/lib/referral';

interface PromoCodeFieldProps {
  itemsSubtotal: number;
  /** Session déjà connue (la page de paiement attend la session) : un code de parrainage dépend du compte */
  token?: string;
  applied: PromoPreview | null;
  onChange: (applied: PromoPreview | null) => void;
}

// « Code promo » du récapitulatif de commande. Le code d'un lien de parrainage est proposé automatiquement.
// La remise affichée est indicative : la commande la recalcule avec les prix du serveur.
export function PromoCodeField({ itemsSubtotal, token, applied, onChange }: PromoCodeFieldProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triedReferral = useRef(false);
  // Montant d'articles pour lequel la remise affichée a été calculée
  const previewedFor = useRef<number | null>(null);

  const apply = async (value: string, { silent = false } = {}) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      previewedFor.current = itemsSubtotal;
      onChange(await previewPromo(trimmed, itemsSubtotal, token));
      setOpen(false);
    } catch (err) {
      onChange(null);
      if (!silent) setError(err instanceof Error ? err.message : 'Ce code promo est invalide');
      else {
        // Code de parrainage inutilisable (déjà client, non connecté…) : proposé dans le champ, sans alerte
        setCode(trimmed);
        setOpen(true);
        setError(err instanceof Error ? err.message : null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Code d'un lien de parrainage : une seule tentative, une fois le panier chargé (il vient du navigateur).
  // Montant des articles modifié : la remise d'un code déjà appliqué est recalculée.
  useEffect(() => {
    if (itemsSubtotal <= 0) return;
    if (applied && previewedFor.current !== itemsSubtotal) {
      previewedFor.current = itemsSubtotal;
      apply(applied.code, { silent: true });
    } else if (!applied && !triedReferral.current) {
      triedReferral.current = true;
      const referral = storedReferral();
      if (referral) {
        previewedFor.current = itemsSubtotal;
        apply(referral, { silent: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement quand le montant change
  }, [itemsSubtotal]);

  if (applied) {
    return (
      <div className="promo-applied">
        <i className="bi bi-tag-fill"></i>
        <span>
          <strong>{applied.code}</strong> {applied.label}
        </span>
        <button type="button" className="link-btn" onClick={() => onChange(null)} aria-label={`Retirer le code ${applied.code}`}>
          Retirer
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="promo-toggle" onClick={() => setOpen(true)}>
        <i className="bi bi-tag"></i> Vous avez un code promo ?
      </button>
    );
  }

  return (
    <div className="promo-field">
      <div className="promo-input">
        <input
          type="text"
          className="form-control"
          placeholder="Code promo ou de parrainage"
          aria-label="Code promo"
          maxLength={40}
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply(code);
            }
          }}
        />
        <button type="button" className="btn-submit" disabled={loading || !code.trim()} onClick={() => apply(code)}>
          {loading ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : 'Appliquer'}
        </button>
      </div>
      {error && <small className="promo-error" role="alert">{error}</small>}
      {itemsSubtotal > 0 && !error && <small className="promo-hint">La remise porte sur les articles ({formatPrice(itemsSubtotal)}).</small>}
    </div>
  );
}
