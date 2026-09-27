import type { Metadata } from 'next';
import { fontVariables } from '@/lib/fonts';
import { siteIcons } from '@/lib/site-metadata';
import './globals.css';
import './admin-shopwise.css';
import { SessionProvider } from '@/components/providers/SessionProvider';

export const metadata: Metadata = {
  title: 'Espace de gestion - Tsena',
  robots: { index: false, follow: false },
  icons: siteIcons,
};

// Layout racine de l'espace d'administration : thème « admin » du template ShopWise
// (barre latérale bleu nuit, accent sarcelle, polices Roboto / Inter / Quicksand hébergées localement : lib/fonts.ts).
// Regroupe l'administration (/admin) et l'espace vendeur (/vendeur) ; groupe séparé de la boutique (shop) :
// ni en-tête ni pied de page de la boutique.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fontVariables} suppressHydrationWarning>
      <head>
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
