import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

// Icônes de l'onglet (partagées par la boutique et l'espace de gestion) : SVG pour les navigateurs récents,
// PNG 32 px pour Safari et les anciens, 180 px plein cadre pour l'écran d'accueil iPhone.
export const siteIcons: Metadata['icons'] = {
  icon: [
    { url: '/icon.svg', type: 'image/svg+xml' },
    { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
  ],
  shortcut: '/favicon-32x32.png',
  apple: '/apple-touch-icon.png',
};

// Métadonnées SEO de la boutique (layout racine (shop)) ; l'espace de gestion a les siennes, non indexées.
export const siteMetadata: Metadata = {
  title: {
    default: 'Tsena - Plateforme de vente en gros pour professionnels à Madagascar',
    template: '%s | Tsena',
  },
  icons: siteIcons,
  description:
    'Tsena est une plateforme B2B de vente en gros à Madagascar : tarifs dégressifs par quantité, paiement par Mobile Money, livraison à Antananarivo. Ouvert aux particuliers.',
  keywords: [
    'tsena',
    'tsena pro',
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
  authors: [{ name: 'Tsena' }],
  creator: 'Tsena',
  publisher: 'Tsena',
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
    siteName: 'Tsena',
    title: 'Tsena - Plateforme de vente en gros pour professionnels',
    description:
      'Tarifs dégressifs par quantité, paiement par Mobile Money, livraison à Antananarivo.',
    images: [
      {
        url: '/electro/img/carousel-1.jpg',
        width: 1200,
        height: 630,
        alt: 'Tsena - Plateforme de vente en gros pour professionnels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tsena - Plateforme de vente en gros pour professionnels',
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
