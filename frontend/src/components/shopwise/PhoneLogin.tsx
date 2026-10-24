'use client';

import React, { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { NEEDS_PROFILE, getCurrentUser, getPhoneLoginStatus, linkPhone, requestPhoneCode } from '@/lib/api/auth';

type Step = 'phone' | 'code' | 'profile';

// « 0341234567 » -> « 034 12 345 67 » (affichage seulement : le backend accepte toutes les écritures)
export function formatMalagasyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^261/, '0');
  return /^0\d{9}$/.test(digits)
    ? `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
    : phone;
}

interface PhoneLoginFormProps {
  /** Connexion réussie (la session NextAuth est ouverte) */
  onSuccess: () => void;
}

// Connexion sans mot de passe : numéro de mobile -> code à 6 chiffres reçu par SMS -> (nouveau client) prénom et nom.
// Le même formulaire crée le compte d'un client qui n'en a pas encore.
export function PhoneLoginForm({ onSuccess }: PhoneLoginFormProps) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compte à rebours avant de pouvoir redemander un code (le backend impose une minute)
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestPhoneCode(phone);
      setDemoCode(result.demoCode ?? null);
      setCode('');
      setStep('code');
      setResendIn(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi du code a échoué.");
    } finally {
      setIsLoading(false);
    }
  };

  const verify = async (withProfile: boolean) => {
    setIsLoading(true);
    setError(null);
    const result = await signIn('phone', {
      phone,
      code,
      ...(withProfile ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
      redirect: false,
    });
    setIsLoading(false);

    if (result?.error === NEEDS_PROFILE) {
      setStep('profile');
      return;
    }
    if (result?.error) {
      setError(result.error === 'CredentialsSignin' ? 'Code incorrect.' : result.error);
      return;
    }
    onSuccess();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'phone') {
      if (phone.replace(/\D/g, '').length < 9) {
        setError('Saisissez votre numéro de mobile (ex. : 034 12 345 67).');
        return;
      }
      sendCode();
    } else if (step === 'code') {
      if (!/^\d{6}$/.test(code)) {
        setError('Le code reçu par SMS comporte 6 chiffres.');
        return;
      }
      verify(false);
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Merci de saisir votre prénom et votre nom.');
        return;
      }
      verify(true);
    }
  };

  const changeNumber = () => {
    setStep('phone');
    setError(null);
    setDemoCode(null);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="row g-3">
        {step === 'phone' && (
          <div className="col-12">
            <label className="form-label" htmlFor="ph-phone">Numéro de mobile</label>
            <input
              type="tel"
              inputMode="tel"
              className="form-control"
              id="ph-phone"
              name="phone"
              placeholder="034 12 345 67"
              required
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <small className="auth-hint">Telma, Orange ou Airtel : nous vous envoyons un code par SMS, sans mot de passe.</small>
          </div>
        )}

        {step === 'code' && (
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-baseline">
              <label className="form-label" htmlFor="ph-code">Code reçu au {formatMalagasyPhone(phone)}</label>
              <a
                href="#"
                className="auth-link-small"
                onClick={(e) => {
                  e.preventDefault();
                  changeNumber();
                }}
              >
                Modifier
              </a>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="form-control auth-code-input"
              id="ph-code"
              name="code"
              placeholder="••••••"
              required
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <div className="d-flex justify-content-between align-items-baseline mt-2">
              <small className="auth-hint">Le code est valable 10 minutes.</small>
              <button type="button" className="auth-link-button" disabled={resendIn > 0 || isLoading} onClick={sendCode}>
                {resendIn > 0 ? `Renvoyer (${resendIn} s)` : 'Renvoyer le code'}
              </button>
            </div>
          </div>
        )}

        {step === 'profile' && (
          <>
            <div className="col-12">
              <div className="alert alert-info mb-0" role="status">
                Bienvenue ! Indiquez votre nom pour créer votre compte.
              </div>
            </div>
            <div className="col-sm-6">
              <label className="form-label" htmlFor="ph-first">Prénom</label>
              <input
                className="form-control"
                id="ph-first"
                name="firstName"
                autoComplete="given-name"
                required
                autoFocus
                maxLength={100}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label" htmlFor="ph-last">Nom</label>
              <input
                className="form-control"
                id="ph-last"
                name="lastName"
                autoComplete="family-name"
                required
                maxLength={100}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </>
        )}

        {(error || (demoCode && step !== 'phone')) && (
          <div className="col-12">
            {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
            {demoCode && step !== 'phone' && (
              <div className={`alert alert-warning mb-0${error ? ' mt-2' : ''}`} role="status">
                Démonstration : aucun SMS n&apos;est envoyé. Votre code est <strong>{demoCode}</strong>.
              </div>
            )}
          </div>
        )}

        <div className="col-12">
          <button type="submit" className="btn-submit w-100" disabled={isLoading}>
            {isLoading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
            {step === 'phone' ? 'Recevoir un code par SMS' : step === 'code' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </div>
      </div>
    </form>
  );
}

// « Mon compte » : numéro vérifié du compte, ou formulaire pour en ajouter un (compte créé par e-mail).
// Masqué si les SMS ne sont pas configurés sur le backend.
export function PhoneLinkCard({ token }: { token: string }) {
  const [enabled, setEnabled] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'phone' | 'code'>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPhoneLoginStatus(), getCurrentUser(token)])
      .then(([status, me]) => {
        if (cancelled) return;
        setEnabled(status.enabled);
        setVerifiedPhone(me.user.verifiedPhone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!enabled) return null;

  const run = async (action: () => Promise<void>) => {
    setIsLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'phone') {
      run(async () => {
        const result = await requestPhoneCode(phone);
        setDemoCode(result.demoCode ?? null);
        setStep('code');
      });
    } else {
      run(async () => {
        const result = await linkPhone(phone, code, token);
        setVerifiedPhone(result.verifiedPhone);
        setStep('idle');
        setCode('');
        setDemoCode(null);
      });
    }
  };

  return (
    <div className="panel-card mt-4">
      <div className="panel-card-head">
        <h4>Connexion par téléphone</h4>
      </div>
      {verifiedPhone && step === 'idle' ? (
        <p className="panel-intro mb-0">
          <i className="bi bi-patch-check-fill text-success me-1"></i>
          Activée au <strong>{formatMalagasyPhone(verifiedPhone)}</strong> : vous pouvez vous connecter avec un code reçu par SMS.
        </p>
      ) : step === 'idle' ? (
        <>
          <p className="panel-intro">
            Ajoutez votre numéro de mobile pour vous connecter avec un code reçu par SMS, sans mot de passe.
          </p>
          <button type="button" className="btn-submit" onClick={() => setStep('phone')}>
            <i className="bi bi-phone me-2"></i>Ajouter mon numéro
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="row g-2 align-items-end">
          <div className="col-sm-8">
            {step === 'phone' ? (
              <>
                <label className="form-label" htmlFor="link-phone">Numéro de mobile</label>
                <input
                  type="tel"
                  inputMode="tel"
                  className="form-control"
                  id="link-phone"
                  placeholder="034 12 345 67"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </>
            ) : (
              <>
                <label className="form-label" htmlFor="link-code">Code reçu au {formatMalagasyPhone(phone)}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="form-control"
                  id="link-code"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </>
            )}
          </div>
          <div className="col-sm-4">
            <button type="submit" className="btn-submit w-100" disabled={isLoading}>
              {isLoading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
              {step === 'phone' ? 'Recevoir le code' : 'Valider'}
            </button>
          </div>
          {error && (
            <div className="col-12">
              <div className="alert alert-danger mb-0" role="alert">{error}</div>
            </div>
          )}
          {demoCode && step === 'code' && (
            <div className="col-12">
              <div className="alert alert-warning mb-0" role="status">
                Démonstration : aucun SMS n&apos;est envoyé. Votre code est <strong>{demoCode}</strong>.
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
