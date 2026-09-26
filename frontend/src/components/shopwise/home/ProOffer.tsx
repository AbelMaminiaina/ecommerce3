import React from 'react';
import Link from 'next/link';
import type { Product } from '@/types';
import { ProductCard } from '@/components/shop/ProductCard';

const STEPS: [string, string][] = [
  ['1', 'Inscription'],
  ['2', 'Validation'],
  ['3', 'Prix de gros'],
];

// « Call To Action » du template ShopWise (fond sombre) : bandeau de l'offre professionnelle,
// puis quatre produits du catalogue.
export function ProOffer({ products }: { products: Product[] }) {
  return (
    <section id="offres" className="sw-section sw-dark">
      <div className="container">
        <div className="sw-offer-banner">
          <div className="row align-items-center gy-3">
            <div className="col-lg-5">
              <span className="sw-pill"><i className="bi bi-lightning-charge-fill"></i> Offre professionnelle</span>
              <h2>Des tarifs dégressifs pour votre entreprise</h2>
              <p>
                Ouvrez votre compte professionnel : validation sous 1 à 2 jours ouvrés, prix de gros sur tout le
                catalogue et paiement par Mobile Money.
              </p>
            </div>
            <div className="col-lg-4">
              <span className="sw-timer-heading"><i className="bi bi-signpost-split"></i> En trois étapes :</span>
              <div className="sw-countdown">
                {STEPS.map(([n, label]) => (
                  <div key={n}>
                    <strong>{n}</strong>
                    <small>{label}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-lg-3">
              <div className="sw-offer-actions">
                <Link href="/inscription" className="sw-btn-primary">
                  Créer un compte pro <i className="bi bi-arrow-right"></i>
                </Link>
                <Link href="/produits" className="sw-btn-ghost">Voir tous les produits</Link>
              </div>
            </div>
          </div>
        </div>

        {products.length > 0 && (
          <div className="row gy-4 mt-2">
            {products.map((product) => (
              <div key={product.id} className="col-lg-3 col-md-6">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
