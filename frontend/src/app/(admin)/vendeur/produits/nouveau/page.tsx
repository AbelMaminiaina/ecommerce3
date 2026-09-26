import { ProductForm } from '@/components/seller/ProductForm';
import { PageHead } from '@/components/admin/AdminShell';

export default function NewSellerProductPage() {
  return (
    <>
      <PageHead
        title="Publier un produit"
        crumbs={[
          { label: 'Espace vendeur', href: '/vendeur' },
          { label: 'Mes produits', href: '/vendeur' },
          { label: 'Publier un produit' },
        ]}
        description="Le produit sera visible dans la boutique après validation par un administrateur."
      />
      <div className="panel max-w-3xl p-6">
        <ProductForm />
      </div>
    </>
  );
}
