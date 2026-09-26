import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { fetchProductOnServer, fetchRelatedProductsOnServer } from '@/lib/api/products';
import ProductDetailClient from './ProductDetailClient';
import { ProductJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { SITE_URL } from '@/lib/site';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Génération dynamique des métadonnées SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductOnServer(slug);

  if (!product) {
    return {
      title: 'Produit non trouvé',
      description: 'Ce produit n\'existe pas ou n\'est plus disponible.',
    };
  }

  const imageUrl = product.images?.[0]?.startsWith('http')
    ? product.images[0]
    : `${SITE_URL}${product.images?.[0] || '/electro/img/carousel-1.jpg'}`;

  return {
    title: product.name,
    description: product.shortDescription || product.description?.slice(0, 160),
    keywords: [
      product.name,
      product.category,
      'tsena pro',
      'madagascar',
      'vente en gros',
      'livraison antananarivo',
    ],
    openGraph: {
      title: `${product.name} | Tsena Pro`,
      description: product.shortDescription || product.description?.slice(0, 160),
      url: `${SITE_URL}/produits/${slug}`,
      siteName: 'Tsena Pro',
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 600,
          alt: product.name,
        },
      ],
      locale: 'fr_MG',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | Tsena Pro`,
      description: product.shortDescription || product.description?.slice(0, 160),
      images: [imageUrl],
    },
    alternates: {
      canonical: `/produits/${slug}`,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const [product, relatedProducts] = await Promise.all([fetchProductOnServer(slug), fetchRelatedProductsOnServer(slug)]);

  if (!product) {
    notFound();
  }

  const breadcrumbItems = [
    { name: 'Accueil', url: SITE_URL },
    { name: 'Produits', url: `${SITE_URL}/produits` },
    { name: product.name, url: `${SITE_URL}/produits/${slug}` },
  ];

  return (
    <>
      <ProductJsonLd
        name={product.name}
        description={product.description}
        image={product.images?.[0] || '/electro/img/carousel-1.jpg'}
        price={product.price}
        availability={product.inStock ? 'InStock' : 'OutOfStock'}
        slug={slug}
      />
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <ProductDetailClient product={product} relatedProducts={relatedProducts} />
    </>
  );
}
