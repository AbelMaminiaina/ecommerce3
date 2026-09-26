import type { Metadata } from 'next';
import './globals.css';
import './admin-shopwise.css';
import { SessionProvider } from '@/components/providers/SessionProvider';

export const metadata: Metadata = {
  title: 'Espace de gestion - Tsena Pro',
  robots: { index: false, follow: false },
};

// Layout racine de l'espace d'administration : thème « admin » du template ShopWise
// (barre latérale bleu nuit, accent sarcelle, polices Roboto / Inter / Quicksand).
// Regroupe l'administration (/admin) et l'espace vendeur (/vendeur) ; groupe séparé de la boutique (shop) :
// ni en-tête ni pied de page de la boutique.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Inter:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/shopwise/bootstrap-icons/bootstrap-icons.min.css" />
      </head>
      <body className="sw-admin" suppressHydrationWarning>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
