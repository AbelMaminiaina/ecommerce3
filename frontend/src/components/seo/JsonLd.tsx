import Script from 'next/script';
import { CONTACT } from '@/lib/contact';
import { SITE_URL } from '@/lib/site';

// Organisation / Entreprise
export function OrganizationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tsena Pro',
    alternateName: 'TsenaPro',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description:
      'Tsena Pro est une plateforme de vente en gros pour professionnels à Madagascar : tarifs dégressifs, paiement par Mobile Money, livraison à Antananarivo.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: CONTACT.address.street,
      addressLocality: CONTACT.address.locality,
      addressRegion: 'Analamanga',
      addressCountry: 'MG',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: CONTACT.email,
      contactType: 'customer service',
      availableLanguage: ['French', 'Malagasy'],
    },
    sameAs: [
      'https://www.facebook.com/tsenapro',
      'https://www.instagram.com/tsenapro',
    ],
  };

  return (
    <Script
      id="organization-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// Entreprise locale
export function LocalBusinessJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#localbusiness`,
    name: 'Tsena Pro',
    image: `${SITE_URL}/icon-512.png`,
    description:
      'Plateforme de vente en gros pour professionnels à Madagascar : catalogue multi-catégories, tarifs dégressifs par quantité, paiement par Mobile Money.',
    url: SITE_URL,
    email: CONTACT.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: CONTACT.address.street,
      addressLocality: CONTACT.address.locality,
      addressRegion: 'Analamanga',
      addressCountry: 'MG',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '17:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '12:00',
      },
    ],
    priceRange: '$$',
    currenciesAccepted: 'MGA',
    paymentAccepted: 'MVola, Orange Money, Airtel Money',
  };

  return (
    <Script
      id="localbusiness-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// Produit
interface ProductJsonLdProps {
  name: string;
  description: string;
  image: string;
  price: number;
  currency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  sku?: string;
  slug: string;
}

export function ProductJsonLd({
  name,
  description,
  image,
  price,
  currency = 'MGA',
  availability = 'InStock',
  sku,
  slug,
}: ProductJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: image.startsWith('http')
      ? image
      : `${SITE_URL}${image}`,
    url: `${SITE_URL}/produits/${slug}`,
    sku: sku || slug,
    brand: {
      '@type': 'Brand',
      name: 'Tsena Pro',
    },
    offers: {
      '@type': 'Offer',
      price: price,
      priceCurrency: currency,
      availability: `https://schema.org/${availability}`,
      seller: {
        '@type': 'Organization',
        name: 'Tsena Pro',
      },
    },
  };

  return (
    <Script
      id={`product-jsonld-${slug}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// Fil d'Ariane (Breadcrumb)
interface BreadcrumbItem {
  name: string;
  url: string;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <Script
      id="breadcrumb-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// WebSite avec SearchAction
export function WebsiteJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tsena Pro',
    url: SITE_URL,
    description:
      'Plateforme de vente en gros pour professionnels à Madagascar - tarifs dégressifs, paiement par Mobile Money.',
    inLanguage: 'fr-MG',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/produits?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <Script
      id="website-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
