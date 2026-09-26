import { PageTitleSkeleton } from '@/components/shop/Skeletons';

// Annuaire des vendeurs : grille de cartes
export default function Loading() {
  return (
    <>
      <PageTitleSkeleton />
      <section className="sw-section" aria-busy="true" aria-label="Chargement des vendeurs">
        <div className="container">
          <div className="row g-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="col-md-6 col-xl-4">
                <span className="sw-skel sw-skel-card-block" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
