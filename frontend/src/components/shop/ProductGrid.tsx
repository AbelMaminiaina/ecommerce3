import React from 'react';
import type { Product } from '@/types';
import { ProductCard } from './ProductCard';
import { ProductGridSkeleton } from './Skeletons';

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  /** Colonnes en très grand écran : 4 par défaut, 3 avec une barre latérale. */
  columns?: 3 | 4;
}

// Grille de cartes produit ShopWise (mêmes espacements que les onglets produits de l'accueil).
export function ProductGrid({ products, loading = false, columns = 4 }: ProductGridProps) {
  const colClass = columns === 3 ? 'col-md-6 col-xl-4' : 'col-md-6 col-lg-4 col-xl-3';

  if (loading) return <ProductGridSkeleton count={columns * 2} columns={columns} />;

  if (products.length === 0) {
    return (
      <div className="sw-empty">
        <i className="bi bi-search"></i>
        <p className="mb-0">Aucun produit ne correspond à votre recherche.</p>
      </div>
    );
  }

  return (
    <div className="row g-3">
      {products.map((product, index) => (
        <div key={product.id} className={colClass}>
          <ProductCard product={product} index={index} />
        </div>
      ))}
    </div>
  );
}
