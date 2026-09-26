'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/types';
import { getProducts } from '@/lib/api/products';
import { useWishlist } from '@/hooks/useWishlist';
import { PageHeader } from '@/components/shop/PageHeader';
import { ProductGrid } from '@/components/shop/ProductGrid';

// Favoris : produits marqués d'un cœur, conservés dans le navigateur.
export default function FavoritesPage() {
  const wishlist = useWishlist();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProducts()
      .then((res) => {
        if (!cancelled) setProducts(res.products);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const favorites = (products ?? []).filter((p) => wishlist.ids.includes(p.id));
  const loading = !wishlist.isHydrated || (products === null && !failed);

  return (
    <>
      <PageHeader
        title="Mes favoris"
        crumbs={[{ label: 'Favoris' }]}
        description={
          wishlist.isHydrated && wishlist.count > 0
            ? `${wishlist.count} produit${wishlist.count > 1 ? 's' : ''} enregistré${wishlist.count > 1 ? 's' : ''} sur cet appareil`
            : undefined
        }
      />

      <section className="sw-section">
        <div className="container">
          {loading ? (
            <ProductGrid products={[]} loading />
          ) : failed ? (
            <div className="sw-empty">
              <i className="bi bi-wifi-off"></i>
              <p className="mb-0">Impossible de charger vos favoris pour le moment.</p>
            </div>
          ) : favorites.length === 0 ? (
            <div className="sw-empty">
              <i className="bi bi-heart"></i>
              <h2>Aucun favori pour l&apos;instant</h2>
              <p>Cliquez sur le cœur d&apos;un produit pour le retrouver ici.</p>
              <Link href="/produits" className="sw-btn-primary">
                Voir nos produits <i className="bi bi-arrow-right"></i>
              </Link>
            </div>
          ) : (
            <>
              <div className="sw-list-toolbar">
                <p className="mb-0">
                  <strong>{favorites.length}</strong> produit{favorites.length > 1 ? 's' : ''} en favori
                </p>
                <button type="button" className="sw-btn-ghost" onClick={wishlist.clear}>
                  <i className="bi bi-trash3"></i>Tout retirer
                </button>
              </div>
              <ProductGrid products={favorites} />
            </>
          )}
        </div>
      </section>
    </>
  );
}
