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
              <span className="sw-skel" style={{ aspectRatio: '1 / 1', borderRadius: 8 }} />
            </div>
            <div className="col-lg-6">
              <span className="sw-skel sw-skel-line" style={{ width: '30%' }} />
              <span className="sw-skel mb-3" style={{ height: 32, width: '80%' }} />
              <span className="sw-skel sw-skel-line" style={{ width: '40%' }} />
              <span className="sw-skel mb-4" style={{ height: 36, width: '35%' }} />
              <span className="sw-skel sw-skel-line" style={{ width: '95%' }} />
              <span className="sw-skel sw-skel-line" style={{ width: '88%' }} />
              <span className="sw-skel sw-skel-line mb-4" style={{ width: '70%' }} />
              <span className="sw-skel" style={{ height: 48, width: '60%' }} />
            </div>
          </div>
          <ProductGridSkeleton count={4} />
        </div>
      </section>
    </>
  );
}
