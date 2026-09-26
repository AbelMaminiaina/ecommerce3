import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { HomeCategory } from './data';

// « Promo Cards » du template ShopWise : bannière mise en avant + cartes des catégories du catalogue.
export function PromoCards({ categories }: { categories: HomeCategory[] }) {
  return (
    <section id="categories" className="sw-section">
      <div className="container">
        <div className="row g-4 align-items-stretch mb-5">
          <div className="col-lg-7">
            <div className="sw-highlight-card">
              <Image src="/shopwise/img/lookbook.webp" alt="Professionnels choisissant leur matériel" width={900} height={600} sizes="(max-width: 992px) 100vw, 58vw" />
            </div>
          </div>
          <div className="col-lg-5 d-flex">
            <div className="sw-highlight-info">
              <span className="sw-pill">Espace professionnel</span>
              <h2>Équipez votre entreprise au meilleur prix</h2>
              <p>
                Créez votre compte professionnel, faites-le valider par notre équipe et accédez à des tarifs
                dégressifs sur tout le catalogue. Particulier ? Vous pouvez aussi commander en gros, sans compte.
              </p>
              <ul className="sw-feature-list">
                <li><i className="bi bi-check-circle"></i> Tarifs dégressifs selon les quantités</li>
                <li><i className="bi bi-check-circle"></i> Vendeurs vérifiés par nos équipes</li>
                <li><i className="bi bi-check-circle"></i> Paiement MVola, Orange Money, Airtel Money</li>
              </ul>
              <Link href="/inscription" className="sw-btn-primary">
                Créer un compte pro <i className="bi bi-arrow-right"></i>
              </Link>
            </div>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="row g-3">
            {categories.map((category) => (
              <div key={category.id} className={categories.length === 5 ? 'col-lg col-md-4 col-sm-6' : 'col-lg-3 col-md-6'}>
                <Link href={`/produits?categorie=${category.slug}`} className="sw-category-card">
                  <div className="sw-category-img">
                    {category.image ? (
                      <Image src={category.image} alt={category.name} width={300} height={300} sizes="(max-width: 768px) 50vw, 20vw" />
                    ) : (
                      <i className="bi bi-grid-3x3-gap text-muted" style={{ fontSize: 48 }}></i>
                    )}
                  </div>
                  <div className="sw-category-body">
                    <h4>{category.name}</h4>
                    <span>
                      {category.count} produit{category.count > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="sw-category-action">
                    <span>Tout voir <i className="bi bi-arrow-right"></i></span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
