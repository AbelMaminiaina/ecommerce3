import React from 'react';

// Squelettes affichés par les loading.tsx de la boutique : le clic réagit immédiatement,
// le contenu remplace le squelette dès que le serveur a répondu.

export function PageTitleSkeleton() {
  return (
    <div className="sw-page-title" aria-hidden="true">
      <div className="container">
        <span className="sw-skel sw-skel-title" />
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="sw-skel-card" aria-hidden="true">
      <span className="sw-skel sw-skel-media" />
      <div className="sw-skel-body">
        <span className="sw-skel sw-skel-line" style={{ width: '45%' }} />
        <span className="sw-skel sw-skel-line" style={{ width: '85%' }} />
        <span className="sw-skel sw-skel-line" style={{ width: '60%' }} />
        <span className="sw-skel sw-skel-line" style={{ width: '35%', height: 18, marginTop: 16, marginBottom: 0 }} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, columns = 4 }: { count?: number; columns?: 3 | 4 }) {
  const colClass = columns === 3 ? 'col-md-6 col-xl-4' : 'col-md-6 col-lg-4 col-xl-3';
  return (
    <div className="row g-3" aria-busy="true" aria-label="Chargement des produits">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={colClass}>
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}

// Page générique : titre + blocs de contenu
export function PageSkeleton() {
  return (
    <>
      <PageTitleSkeleton />
      <section className="sw-section" aria-busy="true" aria-label="Chargement">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-8">
              <span className="sw-skel sw-skel-block mb-4" />
              <span className="sw-skel sw-skel-line" style={{ width: '90%' }} />
              <span className="sw-skel sw-skel-line" style={{ width: '75%' }} />
              <span className="sw-skel sw-skel-line" style={{ width: '82%' }} />
            </div>
            <div className="col-lg-4">
              <span className="sw-skel sw-skel-block" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
