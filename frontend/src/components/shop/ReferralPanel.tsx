'use client';

import React, { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { getReferral, type ReferralInfo } from '@/lib/api/promo';
import { useToast } from './Toast';

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const REWARD_STATUS: Record<ReferralInfo['rewards'][number]['status'], string> = {
  available: 'À utiliser',
  used: 'Utilisé',
  expired: 'Expiré',
};

// Mon compte > Parrainage : code personnel, partage (WhatsApp, Messenger, copie), filleuls et bons gagnés
export function ReferralPanel({ token }: { token: string }) {
  const { addToast } = useToast();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReferral(token)
      .then((data) => !cancelled && setInfo(data))
      .catch(() => !cancelled && setError('Impossible de charger votre parrainage pour le moment.'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <div className="alert alert-warning mb-0">{error}</div>;
  if (!info) {
    return (
      <div className="text-center py-4">
        <span className="spinner-border spinner-border-sm text-primary" aria-label="Chargement"></span>
      </div>
    );
  }
  if (!info.enabled) return <p className="panel-intro mb-0">Le parrainage n&apos;est pas proposé pour le moment.</p>;

  const offer = `${info.discountPercent} %${info.discountMax ? ` (jusqu'à ${formatPrice(info.discountMax)})` : ''}`;
  const message = `Je commande sur Tsena Pro : profite de -${offer} sur ta première commande avec mon code ${info.code} 👉 ${info.link}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => addToast('success', `${label} copié`),
      () => addToast('info', text)
    );
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tsena Pro', text: message, url: info.link });
      } catch {
        // partage annulé par le client
      }
    } else {
      copy(message, 'Message');
    }
  };

  return (
    <>
      <div className="referral-hero">
        <h4>Invitez vos proches, gagnez {formatPrice(info.rewardAmount)}</h4>
        <p>
          Vos filleuls obtiennent <strong>-{offer}</strong> sur leur première commande.
          {info.rewardAmount > 0 && (
            <> Dès qu&apos;elle est payée, vous recevez un bon d&apos;achat de <strong>{formatPrice(info.rewardAmount)}</strong>.</>
          )}
        </p>

        <div className="referral-code">
          <span>Votre code</span>
          <strong>{info.code}</strong>
          <button type="button" className="link-btn" onClick={() => copy(info.code, 'Code')}>
            <i className="bi bi-copy me-1"></i>Copier
          </button>
        </div>

        <div className="referral-share">
          <a
            className="btn-social"
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="bi bi-whatsapp"></i> WhatsApp
          </a>
          <a
            className="btn-social"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(info.link)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="bi bi-facebook"></i> Facebook
          </a>
          <button type="button" className="btn-social" onClick={share}>
            <i className="bi bi-share"></i> Partager
          </button>
          <button type="button" className="btn-social" onClick={() => copy(info.link, 'Lien')}>
            <i className="bi bi-link-45deg"></i> Copier le lien
          </button>
        </div>
      </div>

      <div className="row g-3 my-1">
        <div className="col-sm-6">
          <div className="stat-card">
            <span className="stat-icon"><i className="bi bi-people"></i></span>
            <span className="stat-value">{info.referrals}</span>
            <span className="stat-label">Filleul{info.referrals > 1 ? 's' : ''} ayant commandé</span>
          </div>
        </div>
        <div className="col-sm-6">
          <div className="stat-card">
            <span className="stat-icon"><i className="bi bi-gift"></i></span>
            <span className="stat-value">{info.rewards.filter((r) => r.status === 'available').length}</span>
            <span className="stat-label">Bon{info.rewards.length > 1 ? 's' : ''} à utiliser</span>
          </div>
        </div>
      </div>

      {info.rewards.length > 0 && (
        <ul className="referral-rewards">
          {info.rewards.map((reward) => (
            <li key={reward.code} className={`st-${reward.status}`}>
              <div>
                <strong>{reward.code}</strong>
                <span>
                  {formatPrice(reward.amount)}
                  {reward.endsAt && reward.status === 'available' && ` · valable jusqu'au ${dateFr(reward.endsAt)}`}
                </span>
              </div>
              <span className="reward-status">{REWARD_STATUS[reward.status]}</span>
              {reward.status === 'available' && (
                <button type="button" className="link-btn" onClick={() => copy(reward.code, 'Code')}>
                  Copier
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
