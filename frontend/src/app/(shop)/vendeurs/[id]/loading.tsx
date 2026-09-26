import { PageTitleSkeleton, ProductGridSkeleton } from '@/components/shop/Skeletons';

// Page d'un vendeur : bloc de profil puis ses produits
export default function Loading() {
  return (
    <>
      <PageTitleSkeleton />
      <section className="sw-section" aria-busy="true" aria-label="Chargement du vendeur">
        <div className="container">
          <span className="sw-skel sw-skel-profile mb-5" />
          <ProductGridSkeleton count={4} />
        </div>
      </section>
    </>
  );
}
