'use client';

import React, { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';
import { AuthAside, SocialAuth, PasswordField } from '@/components/shopwise/auth';
import { CONTACT, CONTACT_MAILTO } from '@/lib/contact';

// Connexion du template ShopWise (login.html) : carte formulaire + colonne des avantages client.
function ConnexionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const urlError = searchParams.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === 'CredentialsSignin' ? 'Adresse e-mail ou mot de passe incorrect.' : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowForgot(false);
    if (!email.trim() || !password) {
      setError('Merci de saisir une adresse e-mail valide et votre mot de passe.');
      return;
    }
    setIsLoading(true);
    setError(null);

    const result = await signIn('credentials', { email, password, redirect: false });

    if (result?.error) {
      setError('Adresse e-mail ou mot de passe incorrect.');
      setPassword('');
      setIsLoading(false);
      return;
    }

    setSuccess('Heureux de vous revoir ! Redirection en cours…');
    router.push(callbackUrl);
  };

  return (
    <>
      <PageHeader title="Connexion" crumbs={[{ label: 'Connexion' }]} />

      <section id="auth" className="sw-section auth">
        <div className="container">
          <div className="row g-4 justify-content-center align-items-stretch">

            {/* Formulaire */}
            <div className="col-lg-6 col-md-9">
              <div className="auth-card">
                <div className="auth-card-header">
                  <h3>Bon retour parmi nous</h3>
                  <p>Connectez-vous pour suivre vos commandes et retrouver vos favoris.</p>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="lg-email">Adresse e-mail</label>
                      <input
                        type="email"
                        className="form-control"
                        id="lg-email"
                        name="email"
                        placeholder="jean@exemple.mg"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="col-12">
                      <div className="d-flex justify-content-between align-items-baseline">
                        <label className="form-label" htmlFor="lg-password">Mot de passe</label>
                        <a
                          href="#"
                          className="auth-link-small"
                          onClick={(e) => {
                            e.preventDefault();
                            setShowForgot((v) => !v);
                          }}
                        >
                          Mot de passe oublié ?
                        </a>
                      </div>
                      <PasswordField
                        id="lg-password"
                        name="password"
                        placeholder="Votre mot de passe"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    {(error || success || showForgot) && (
                      <div className="col-12">
                        {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
                        {success && <div className="alert alert-success mb-0" role="status">{success}</div>}
                        {showForgot && !success && (
                          <div className={`alert alert-info mb-0${error ? ' mt-2' : ''}`} role="status">
                            Pour réinitialiser votre mot de passe, écrivez-nous à{' '}
                            <a href={CONTACT_MAILTO}>{CONTACT.email}</a> depuis l&apos;adresse de votre compte.
                          </div>
                        )}
                      </div>
                    )}
                    <div className="col-12">
                      <button type="submit" className="btn-submit w-100" disabled={isLoading}>
                        {isLoading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                        Se connecter
                      </button>
                    </div>
                  </div>
                </form>

                <SocialAuth label="ou continuer avec" />

                <p className="auth-switch">
                  Pas encore de compte ?{' '}
                  <Link href={`/inscription?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Créer un compte</Link>
                </p>
              </div>
            </div>

            <AuthAside />
          </div>
        </div>
      </section>
    </>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionContent />
    </Suspense>
  );
}
