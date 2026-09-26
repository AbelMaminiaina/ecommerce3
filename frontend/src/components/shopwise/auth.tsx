'use client';

import React, { useState } from 'react';
import { useToast } from '@/components/shop/Toast';

// Colonne « Vos avantages client » des pages Connexion et Inscription (login.html, register.html)
export function AuthAside() {
  return (
    <div className="col-lg-5 d-none d-lg-block">
      <div className="auth-aside">
        <span className="auth-aside-badge"><i className="bi bi-stars"></i> Membre Tsena Pro</span>
        <h3>Vos avantages client</h3>
        <ul className="auth-perks">
          <li>
            <i className="bi bi-tags"></i>
            <div><strong>Tarifs dégressifs</strong><span>Plus vous commandez, moins vous payez à l&apos;unité (comptes professionnels).</span></div>
          </li>
          <li>
            <i className="bi bi-receipt"></i>
            <div><strong>Suivi de commandes</strong><span>Retrouvez l&apos;historique et le statut de vos achats.</span></div>
          </li>
          <li>
            <i className="bi bi-bookmark-heart"></i>
            <div><strong>Favoris</strong><span>Gardez vos produits préférés sous la main.</span></div>
          </li>
          <li>
            <i className="bi bi-phone"></i>
            <div><strong>Paiement Mobile Money</strong><span>Réglez vos commandes par MVola, Orange Money ou Airtel Money.</span></div>
          </li>
        </ul>
      </div>
    </div>
  );
}

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean };

// Champ mot de passe avec bouton « Afficher / Masquer »
export function PasswordField({ invalid, className = '', ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} className={`form-control${invalid ? ' is-invalid' : ''} ${className}`} />
      <button
        type="button"
        className="toggle-password"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        onClick={() => setVisible((v) => !v)}
      >
        <i className={visible ? 'bi bi-eye-slash' : 'bi bi-eye'}></i>
      </button>
    </div>
  );
}

function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LEVELS: [string, string][] = [
  ['Utilisez lettres, chiffres et symboles.', 'transparent'],
  ['Faible', '#dc3545'],
  ['Moyen', '#f59e0b'],
  ['Bon', '#22c55e'],
  ['Excellent', '#0d9488'],
];

// Jauge de robustesse du mot de passe
export function PasswordStrength({ password }: { password: string }) {
  const score = password ? Math.max(passwordScore(password), 1) : 0;
  const [label, color] = STRENGTH_LEVELS[score];
  return (
    <div className="password-strength" aria-live="polite">
      <div className="strength-bar">
        <span style={{ width: `${score * 25}%`, background: color }}></span>
      </div>
      <small className="strength-label">{label}</small>
    </div>
  );
}

// Séparateur « ou continuer avec » + boutons Google et Apple (login.html, register.html).
// Aucun fournisseur OAuth n'est encore configuré : comme dans le template, le clic l'indique.
export function SocialAuth({ label }: { label: string }) {
  const { addToast } = useToast();
  const notAvailable = (provider: string) =>
    addToast('info', `La connexion via ${provider} n'est pas encore disponible. Utilisez votre adresse e-mail.`);

  return (
    <>
      <div className="auth-divider"><span>{label}</span></div>
      <div className="auth-social">
        <button type="button" className="btn-social" onClick={() => notAvailable('Google')}>
          <i className="bi bi-google"></i> Google
        </button>
        <button type="button" className="btn-social" onClick={() => notAvailable('Apple')}>
          <i className="bi bi-apple"></i> Apple
        </button>
      </div>
    </>
  );
}
