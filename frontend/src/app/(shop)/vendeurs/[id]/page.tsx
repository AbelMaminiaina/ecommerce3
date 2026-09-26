import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductsOnServer } from '@/lib/api/products';
import { fetchSellerOnServer } from '@/lib/api/sellers';
import { PageHeader } from '@/components/shop/PageHeader';
import { memberSinceLabel } from '@/components/shop/SellerCard';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { SellerOwnerLink } from './SellerOwnerLink';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const seller = await fetchSellerOnServer(id);
  if (!seller) return { title: 'Vendeur introuvable' };
  return {
    title: `${seller.name} : boutique`,
    description: `Découvrez les ${seller.productCount} produits vendus en gros par ${seller.name}.`,
    alternates: { canonical: `/vendeurs/${id}` },
  };
}

// Profil public d'un vendeur : l'entreprise (et le responsable du compte) derrière les produits
export default async function SellerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const [seller, products] = await Promise.all([fetchSellerOnServer(id), fetchProductsOnServer(`seller=${encodeURIComponent(id)}`).catch(() => [])]);

  if (!seller) notFound();

  return (
    <>
      <PageHeader
        title={seller.name}
        crumbs={[{ label: 'Vendeurs', href: '/vendeurs' }, { label: seller.name }]}
      />

      <section className="sw-section">
        <div className="container">
          {/* Profil */}
          <div className="sw-seller-profile">
            <span className="seller-avatar" aria-hidden="true">{seller.name.charAt(0).toUpperCase()}</span>
            <div className="profile-main">
              <h2>
                {seller.name}
                <i className="bi bi-patch-check-fill" title="Entreprise vérifiée"></i>
              </h2>
              {seller.legalName && <p className="legal">{seller.legalName}</p>}
              <ul className="seller-facts">
                {seller.contactPerson && (
                  <li>
                    <i className="bi bi-person"></i>
                    Responsable du compte : <strong>{seller.contactPerson}</strong>
                  </li>
                )}
                <li>
                  <i className="bi bi-calendar3"></i>
                  Membre depuis {memberSinceLabel(seller.memberSince)}
                </li>
                <li>
                  <i className="bi bi-shield-check"></i>
                  Entreprise vérifiée par notre équipe
                </li>
                <li>
                  <i className="bi bi-box-seam"></i>
                  {seller.productCount} produit{seller.productCount > 1 ? 's' : ''} en vente
                </li>
              </ul>
            </div>
            <div className="profile-actions">
              <Link href="/contact" className="sw-btn-primary">
                <i className="bi bi-envelope"></i>Nous contacter
              </Link>
              <SellerOwnerLink sellerId={seller.id} />
            </div>
          </div>

          <div className="sw-section-head">
            <h2>Produits de {seller.name}</h2>
            <span>{products.length} produit{products.length > 1 ? 's' : ''}</span>
          </div>
          <ProductGrid products={products} />
        </div>
      </section>
    </>
  );
}
