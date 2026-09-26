import React from 'react';
import type { Product } from '@/types';
import { ProductCard } from '@/components/shop/ProductCard';

// « Best Sellers » du template ShopWise : titre centré souligné et quatre cartes produit.
export function BestSellers({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section id="best-sellers" className="sw-section">
      <div className="container sw-section-title">
        <h2>Meilleures ventes</h2>
        <p>Les produits les plus commandés par nos clients professionnels et particuliers</p>
      </div>
      <div className="container">
        <div className="row g-4">
          {products.map((product) => (
            <div key={product.id} className="col-lg-3 col-md-6">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
