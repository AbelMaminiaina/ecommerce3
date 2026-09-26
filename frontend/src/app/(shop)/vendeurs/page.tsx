import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';
import { SellerCard } from '@/components/shop/SellerCard';
import { fetchSellersOnServer } from '@/lib/api/sellers';

// Le backend n'est pas joignable pendant le build Docker isolé : rendu à chaque requête
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nos vendeurs',
  description:
    'Les entreprises qui publient leurs produits en gros sur la plateforme : découvrez leurs boutiques.',
  alternates: { canonical: '/vendeurs' },
};

// Annuaire des entreprises vendeuses (comptes professionnels approuvés ayant des produits publiés)
export default async function SellersPage() {
  const sellers = await fetchSellersOnServer();

  return (
    <>
      <PageHeader
        title="Nos vendeurs"
        crumbs={[{ label: 'Vendeurs' }]}
        description="Des entreprises approuvées par notre équipe, qui publient leurs produits en gros."
      />

      <section className="sw-section">
        <div className="container">
          {sellers.length === 0 ? (
            <div className="sw-empty">
              <i className="bi bi-shop"></i>
              <h2>Aucun vendeur pour le moment</h2>
              <p>Vous êtes une entreprise ? Créez un compte professionnel et publiez vos produits en gros.</p>
              <Link href="/inscription" className="sw-btn-primary">
                Devenir vendeur <i className="bi bi-arrow-right"></i>
              </Link>
            </div>
          ) : (
            <>
              <div className="row g-3">
                {sellers.map((seller) => (
                  <div key={seller.id} className="col-md-6 col-xl-4">
                    <SellerCard seller={seller} />
                  </div>
                ))}
              </div>
              <div className="sw-seller-cta">
                <div>
                  <span className="sw-pill">Vendeurs</span>
                  <h2>Vous êtes une entreprise et vous vendez en gros ?</h2>
                  <p>Publiez vos produits sur la plateforme : notre équipe valide votre compte, puis chaque produit.</p>
                </div>
                <Link href="/inscription" className="sw-btn-primary">
                  Publier mes produits <i className="bi bi-arrow-right"></i>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
