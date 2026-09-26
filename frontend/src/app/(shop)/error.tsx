'use client';

import { useEffect } from 'react';

// Filet de sécurité de la boutique : au lieu d'un écran d'erreur brut, un message et deux issues.
// Le panier étant conservé dans le navigateur, un panier corrompu ou périmé est une cause possible.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const clearCartAndRetry = () => {
    try {
      localStorage.removeItem('b2b-cart');
    } catch {
      // stockage indisponible : on réessaie simplement
    }
    reset();
  };

  return (
    <section className="sw-section">
      <div className="container">
        <div className="sw-error">
          <span className="error-icon"><i className="bi bi-exclamation-triangle"></i></span>
          <h1>Une erreur est survenue</h1>
          <p>
            La page n&apos;a pas pu s&apos;afficher. Vous pouvez réessayer ; si le problème vient de votre panier,
            videz-le puis recommencez vos achats.
          </p>
          <div className="error-actions">
            <button type="button" className="sw-btn-primary" onClick={reset}>
              <i className="bi bi-arrow-clockwise"></i>Réessayer
            </button>
            <button type="button" className="sw-btn-ghost" onClick={clearCartAndRetry}>
              <i className="bi bi-cart-x"></i>Vider le panier et réessayer
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
