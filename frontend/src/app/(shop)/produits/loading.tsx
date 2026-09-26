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
              {['sw-skel-h160', 'sw-skel-h220', 'sw-skel-h110'].map((height) => (
                <div key={height} className="shop-widget">
                  <span className="sw-skel sw-skel-line sw-skel-w50" />
                  <span className={`sw-skel ${height}`} />
                </div>
              ))}
            </aside>
            <div className="col-lg-9">
              <span className="sw-skel sw-skel-toolbar mb-3" />
              <ProductGridSkeleton count={9} columns={3} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
