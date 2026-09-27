import { Suspense } from 'react';
import { Metadata } from 'next';
import { fetchProductsOnServer } from '@/lib/api/products';
import ProductsClient from './ProductsClient';
import { SITE_URL } from '@/lib/site';

// This page fetches from the backend, which isn't reachable from the isolated
// Docker build stage — force per-request rendering so the build doesn't try
// to prerender it statically.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalogue - Vente en gros pour professionnels',
  description:
    'Découvrez notre catalogue multi-catégories pour professionnels : smartphones, ordinateurs, photo, audio et accessoires. Tarifs dégressifs, livraison à Antananarivo.',
  keywords: [
    'catalogue grossiste madagascar',
    'vente en gros antananarivo',
    'fournitures professionnelles',
    'tarifs dégressifs',
    'achat en gros madagascar',
    'livraison professionnelle antananarivo',
  ],
  openGraph: {
    title: 'Catalogue | Tsena',
    description:
      'Un catalogue multi-catégories pour professionnels, avec tarifs dégressifs par quantité et livraison à Antananarivo.',
    url: `${SITE_URL}/produits`,
    siteName: 'Tsena',
    locale: 'fr_MG',
    type: 'website',
  },
  alternates: {
    canonical: '/produits',
  },
};

export default async function ProductsPage() {
  const products = await fetchProductsOnServer();

  return (
    <Suspense fallback={<div className="container py-5 text-center">Chargement…</div>}>
      <ProductsClient initialProducts={products} />
    </Suspense>
  );
}
