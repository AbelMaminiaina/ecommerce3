'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { PageHeader } from '@/components/shop/PageHeader';
import { AuthAside, SocialAuth, PasswordField, PasswordStrength } from '@/components/shopwise/auth';
import { registerCompany, registerCustomer } from '@/lib/api/auth';
import { subscribeToNewsletter } from '@/lib/api/newsletter';

type AccountType = 'particulier' | 'professionnel';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  password: '',
  confirm: '',
  companyName: '',
  taxId: '',
  contactEmail: '',
  terms: false,
  newsletter: false,
};

type FormState = typeof EMPTY_FORM;
type Field = keyof FormState;

// Inscription du template ShopWise (register.html). Deux types de compte :
//  - particulier : actif immédiatement, connecté dans la foulée ;
//  - professionnel : entreprise enregistrée puis validée par l'équipe (tarifs dégressifs, vente).
function InscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/produits';
  const [type, setType] = useState<AccountType>(searchParams.get('type') === 'professionnel' ? 'professionnel' : 'particulier');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [companySubmitted, setCompanySubmitted] = useState(false);

  const isPro = type === 'professionnel';

  const update = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setInvalid((prev) => ({ ...prev, [field]: false }));
  };

  const validate = (): string | null => {
    const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    const next: Partial<Record<Field, boolean>> = {
      firstName: !form.firstName.trim(),
      lastName: !form.lastName.trim(),
      email: !emailOk(form.email),
      password: form.password.length < 8,
      confirm: !form.confirm || form.confirm !== form.password,
      terms: !form.terms,
      ...(isPro && {
        companyName: !form.companyName.trim(),
        taxId: !form.taxId.trim(),
        contactEmail: !emailOk(form.contactEmail),
      }),
    };
    setInvalid(next);
    if (form.confirm && form.confirm !== form.password) return 'Les deux mots de passe ne correspondent pas.';
    if (Object.values(next).some(Boolean)) {
      return 'Merci de compléter les champs signalés en rouge (mot de passe de 8 caractères minimum, conditions à accepter).';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      if (isPro) {
        await registerCompany({
          companyName: form.companyName.trim(),
          taxId: form.taxId.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.phone || undefined,
          user: {
            email: form.email.trim(),
            password: form.password,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
          },
        });
      } else {
        await registerCustomer({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone || undefined,
          email: form.email.trim(),
          password: form.password,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setIsLoading(false);
      return;
    }

    // L'inscription à la newsletter est facultative : un échec ne bloque pas la création du compte
    if (form.newsletter) await subscribeToNewsletter(form.email.trim()).catch(() => undefined);

    if (isPro) {
      setCompanySubmitted(true);
      setIsLoading(false);
      return;
    }

    // Compte particulier actif immédiatement : on connecte directement le nouveau client
    setSuccess(`Bienvenue ${form.firstName.trim()} ! Votre compte a été créé, redirection en cours…`);
    const result = await signIn('credentials', { email: form.email.trim(), password: form.password, redirect: false });
    router.push(result?.error ? `/connexion?callbackUrl=${encodeURIComponent(callbackUrl)}` : callbackUrl);
  };

  const inputClass = (field: Field) => `form-control${invalid[field] ? ' is-invalid' : ''}`;

  return (
    <>
      <PageHeader title="Créer un compte" crumbs={[{ label: 'Inscription' }]} />

      <section id="auth" className="sw-section auth">
        <div className="container">
          <div className="row g-4 justify-content-center align-items-stretch">

            {/* Formulaire */}
            <div className="col-lg-6 col-md-9">
              <div className="auth-card">
                {companySubmitted ? (
                  <div className="auth-done">
                    <i className="bi bi-check-circle"></i>
                    <div className="auth-card-header">
                      <h3>Demande envoyée !</h3>
                      <p>
                        Votre entreprise a été enregistrée et est en attente de validation par notre équipe. Vous
                        recevrez un e-mail dès que votre compte sera approuvé (1 à 2 jours ouvrés).
                      </p>
                    </div>
                    <Link href="/" className="btn-submit">Retour à l&apos;accueil</Link>
                  </div>
                ) : (
                  <>
                    <div className="auth-card-header">
                      <h3>Rejoignez Tsena</h3>
                      <p>Créez votre compte en moins d&apos;une minute et profitez de tous vos avantages.</p>
                    </div>

                    <div className="auth-type" role="radiogroup" aria-label="Type de compte">
                      {(['particulier', 'professionnel'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={type === t}
                          className={`btn-social${type === t ? ' active' : ''}`}
                          onClick={() => {
                            setType(t);
                            setError(null);
                          }}
                        >
                          <i className={`bi ${t === 'particulier' ? 'bi-person' : 'bi-building'}`}></i>
                          {t === 'particulier' ? 'Particulier' : 'Professionnel'}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleSubmit} noValidate>
                      <div className="row g-3">
                        {isPro && (
                          <>
                            <div className="col-12"><p className="auth-subtitle">Entreprise</p></div>
                            <div className="col-12">
                              <label className="form-label" htmlFor="rg-company">Raison sociale</label>
                              <input type="text" className={inputClass('companyName')} id="rg-company" placeholder="Rakoto Distribution SARL" autoComplete="organization" value={form.companyName} onChange={update('companyName')} />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label" htmlFor="rg-taxid">Numéro fiscal (NIF)</label>
                              <input type="text" className={inputClass('taxId')} id="rg-taxid" placeholder="4000000000" value={form.taxId} onChange={update('taxId')} />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label" htmlFor="rg-contact">E-mail de l&apos;entreprise</label>
                              <input type="email" className={inputClass('contactEmail')} id="rg-contact" placeholder="contact@entreprise.mg" value={form.contactEmail} onChange={update('contactEmail')} />
                            </div>
                            <div className="col-12"><p className="auth-subtitle">Votre compte</p></div>
                          </>
                        )}
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="rg-firstname">Prénom</label>
                          <input type="text" className={inputClass('firstName')} id="rg-firstname" placeholder="Jean" autoComplete="given-name" value={form.firstName} onChange={update('firstName')} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="rg-lastname">Nom</label>
                          <input type="text" className={inputClass('lastName')} id="rg-lastname" placeholder="Rakoto" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} />
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="rg-email">{isPro ? 'Adresse e-mail professionnelle' : 'Adresse e-mail'}</label>
                          <input type="email" className={inputClass('email')} id="rg-email" placeholder="jean@exemple.mg" autoComplete="email" value={form.email} onChange={update('email')} />
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="rg-phone">Téléphone</label>
                          <input type="tel" className="form-control" id="rg-phone" placeholder="034 00 000 00" autoComplete="tel" value={form.phone} onChange={update('phone')} />
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="rg-password">Mot de passe</label>
                          <PasswordField
                            id="rg-password"
                            placeholder="8 caractères minimum"
                            autoComplete="new-password"
                            invalid={invalid.password}
                            value={form.password}
                            onChange={update('password')}
                          />
                          <PasswordStrength password={form.password} />
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="rg-confirm">Confirmer le mot de passe</label>
                          <input type="password" className={inputClass('confirm')} id="rg-confirm" placeholder="Saisissez-le à nouveau" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
                        </div>
                        <div className="col-12">
                          <div className="form-check">
                            <input className={`form-check-input${invalid.terms ? ' is-invalid' : ''}`} type="checkbox" id="rg-terms" checked={form.terms} onChange={update('terms')} />
                            <label className="form-check-label" htmlFor="rg-terms">
                              J&apos;accepte les <Link href="/cgv">conditions générales</Link> et la{' '}
                              <Link href="/politique-confidentialite">politique de confidentialité</Link>
                            </label>
                          </div>
                          <div className="form-check mt-2">
                            <input className="form-check-input" type="checkbox" id="rg-news" checked={form.newsletter} onChange={update('newsletter')} />
                            <label className="form-check-label" htmlFor="rg-news">Recevoir les offres et nouveautés par e-mail</label>
                          </div>
                        </div>
                        {(error || success) && (
                          <div className="col-12">
                            {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
                            {success && <div className="alert alert-success mb-0" role="status">{success}</div>}
                          </div>
                        )}
                        <div className="col-12">
                          <button type="submit" className="btn-submit w-100" disabled={isLoading}>
                            {isLoading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                            {isPro ? 'Envoyer ma demande' : 'Créer mon compte'}
                          </button>
                        </div>
                      </div>
                    </form>

                    <SocialAuth label="ou s'inscrire avec" />

                    <p className="auth-switch">
                      Déjà client ? <Link href={`/connexion?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Se connecter</Link>
                    </p>
                  </>
                )}
              </div>
            </div>

            <AuthAside />
          </div>
        </div>
      </section>
    </>
  );
}

export default function InscriptionPage() {
  return (
    <Suspense fallback={null}>
      <InscriptionContent />
    </Suspense>
  );
}
