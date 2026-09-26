import { PageTitleSkeleton, ProductGridSkeleton } from '@/components/shop/Skeletons';

// Fiche produit : visuel à gauche, informations et achat à droite, puis produits similaires
export default function Loading() {
  return (
    <>
      <PageTitleSkeleton />
      <section className="sw-section" aria-busy="true" aria-label="Chargement du produit">
        <div className="container">
          <div className="row g-4 mb-5">
            <div className="col-lg-6">
              <span className="sw-skel sw-skel-square" />
            </div>
            <div className="col-lg-6">
              <span className="sw-skel sw-skel-line sw-skel-w30" />
              <span className="sw-skel sw-skel-heading sw-skel-w80 mb-3" />
              <span className="sw-skel sw-skel-line sw-skel-w40" />
              <span className="sw-skel sw-skel-price sw-skel-w35 mb-4" />
              <span className="sw-skel sw-skel-line sw-skel-w95" />
              <span className="sw-skel sw-skel-line sw-skel-w90" />
              <span className="sw-skel sw-skel-line sw-skel-w70 mb-4" />
              <span className="sw-skel sw-skel-btn sw-skel-w60" />
            </div>
          </div>
          <ProductGridSkeleton count={4} />
        </div>
      </section>
    </>
  );
}
