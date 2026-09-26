import { PageTitleSkeleton, ProductGridSkeleton } from '@/components/shop/Skeletons';

// Catalogue : même mise en page que ProductsClient (filtres à gauche, grille de 3 colonnes)
export default function Loading() {
  return (
    <>
      <PageTitleSkeleton />
      <section className="sw-section sw-shop">
        <div className="container">
          <div className="row g-4">
            <aside className="col-lg-3 d-none d-lg-block" aria-hidden="true">
              {[160, 220, 110].map((height, i) => (
                <div key={i} className="shop-widget">
                  <span className="sw-skel sw-skel-line" style={{ width: '50%' }} />
                  <span className="sw-skel" style={{ height }} />
                </div>
              ))}
            </aside>
            <div className="col-lg-9">
              <span className="sw-skel mb-3" style={{ height: 54 }} />
              <ProductGridSkeleton count={9} columns={3} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
