'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageHeader } from '@/components/shop/PageHeader';
import { PaymentPanel } from '@/components/shop/PaymentPanel';
import { useToast } from '@/components/shop/Toast';
import { GUEST_EMAIL_KEY } from '@/hooks/usePayment';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  // Une commande par vendeur : les numéros sont séparés par des virgules
  const orderNumbers = (searchParams.get('order') || 'N/A').split(',').filter(Boolean);
  // Commande sans compte : l'e-mail saisi sert, avec le numéro, à suivre la commande
  // Au retour de la page de paiement d'un opérateur (?paiement=retour), l'adresse ne contient pas l'e-mail : le
  // navigateur l'a gardé le temps de l'aller-retour.
  const returningFromOperator = searchParams.get('paiement') !== null;
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!returningFromOperator) return;
    try {
      setRememberedEmail(sessionStorage.getItem(GUEST_EMAIL_KEY));
    } catch {
      // stockage indisponible : le visiteur peut retrouver sa commande avec le suivi
    }
  }, [returningFromOperator]);
  const guestEmail = searchParams.get('guest') ?? rememberedEmail;
  const { data: session, status: authStatus } = useSession();
  // Le paiement se règle avec l'identité de l'acheteur : session connectée ou e-mail du visiteur
  const identityReady = Boolean(guestEmail) || authStatus !== 'loading';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('info', 'Numéro copié');
  };

  return (
    <>
      <PageHeader title="Paiement de la commande" crumbs={[{ label: 'Commande', href: '/checkout' }, { label: 'Confirmation' }]} />
      <section className="sw-section sw-confirm">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-7">
              <div className="confirm-hero">
                <span className="confirm-icon"><i className="bi bi-check-lg"></i></span>
                <h2>Commande enregistrée !</h2>
                <p>
                  Il ne reste qu&apos;à régler par Mobile Money : votre commande sera traitée dès que votre paiement aura
                  été vérifié. Les instructions vous ont aussi été envoyées par e-mail.
                </p>
              </div>

              <div className="confirm-card">
                <PaymentPanel
                  orderNumber={orderNumbers[0]}
                  email={guestEmail ?? undefined}
                  token={guestEmail ? undefined : session?.accessToken}
                  enabled={identityReady}
                />
              </div>

              {orderNumbers.length > 1 && (
                <p className="confirm-note">
                  <i className="bi bi-shop"></i>
                  Votre panier contenait des produits de {orderNumbers.length} vendeurs : une commande a été créée
                  pour chacun, suivie séparément.
                </p>
              )}

              {orderNumbers.map((orderNumber) => (
                <div key={orderNumber} className="confirm-order">
                  <div>
                    <small>Numéro de commande</small>
                    <strong>{orderNumber}</strong>
                  </div>
                  <button
                    type="button"
                    className="sw-icon-btn"
                    onClick={() => copyToClipboard(orderNumber)}
                    aria-label={`Copier le numéro de commande ${orderNumber}`}
                    title="Copier"
                  >
                    <i className="bi bi-copy"></i>
                  </button>
                </div>
              ))}

              {guestEmail && (
                <div className="confirm-card confirm-guest">
                  <h3><i className="bi bi-info-circle"></i>Commande sans compte</h3>
                  <p>
                    Un e-mail de confirmation a été envoyé à <strong>{guestEmail}</strong>.
                    Conservez {orderNumbers.length > 1 ? 'ces numéros' : 'ce numéro'} : il permet de suivre votre commande
                    avec cette adresse e-mail.
                  </p>
                  <Link
                    href={`/suivi-commande?order=${encodeURIComponent(orderNumbers[0])}&email=${encodeURIComponent(guestEmail)}`}
                    className="confirm-link"
                  >
                    Suivre ma commande <i className="bi bi-arrow-right"></i>
                  </Link>
                </div>
              )}

              <div className="confirm-actions">
                <Link href="/suivi-commande" className="sw-btn-ghost">
                  <i className="bi bi-box-seam"></i>Suivre ma commande
                </Link>
                <Link href="/produits" className="sw-btn-primary">
                  <i className="bi bi-bag"></i>Continuer mes achats
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="container py-5 text-center">Chargement…</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
