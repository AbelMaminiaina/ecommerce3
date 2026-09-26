import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

// Métadonnées SEO de la boutique (layout racine (shop)) ; l'espace de gestion a les siennes, non indexées.
export const siteMetadata: Metadata = {
  title: {
    default: 'Tsena Pro - Plateforme de vente en gros pour professionnels à Madagascar',
    template: '%s | Tsena Pro',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  description:
    'Tsena Pro est une plateforme B2B de vente en gros à Madagascar : tarifs dégressifs par quantité, paiement par Mobile Money, livraison à Antananarivo. Ouvert aux particuliers.',
  keywords: [
    'all',
    'grossiste madagascar',
    'vente en gros madagascar',
    'plateforme b2b madagascar',
    'achat professionnel antananarivo',
    'tarifs dégressifs',
    'paiement mobile money',
    'mvola orange money airtel money',
    'fournisseur grossiste',
    'livraison professionnelle antananarivo',
    'compte professionnel',
  ],
  authors: [{ name: 'Tsena Pro' }],
  creator: 'Tsena Pro',
  publisher: 'Tsena Pro',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_MG',
    url: SITE_URL,
    siteName: 'Tsena Pro',
    title: 'Tsena Pro - Plateforme de vente en gros pour professionnels',
    description:
      'Tarifs dégressifs par quantité, paiement par Mobile Money, livraison à Antananarivo.',
    images: [
      {
        url: '/electro/img/carousel-1.jpg',
        width: 1200,
        height: 630,
        alt: 'Tsena Pro - Plateforme de vente en gros pour professionnels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tsena Pro - Plateforme de vente en gros pour professionnels',
    description:
      'Tarifs dégressifs par quantité, paiement par Mobile Money, livraison à Antananarivo.',
    images: ['/electro/img/carousel-1.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
};
