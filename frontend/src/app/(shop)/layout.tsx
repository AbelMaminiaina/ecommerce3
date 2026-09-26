import { siteMetadata } from '@/lib/site-metadata';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ToastProvider } from '@/components/shop/Toast';
import { ShopwiseHeader } from '@/components/shopwise/Header';
import { ShopwiseFooter } from '@/components/shopwise/Footer';
import { OrganizationJsonLd, LocalBusinessJsonLd, WebsiteJsonLd } from '@/components/seo/JsonLd';

export const metadata = siteMetadata;

// Layout racine de la boutique : Bootstrap 5 + thème ShopWise (aucun Tailwind ici).
// style.css / electro-extra.css (hérités d'Electro) fournissent encore quelques bases,
// shopwise.css passe en dernier : il recolore Bootstrap et définit les composants ShopWise (sw-*).
// L'espace de gestion ((admin) : /admin et /vendeur) a son propre layout racine en Tailwind :
// la navigation entre les deux groupes recharge la page, ce qui évite tout mélange de CSS.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Inter:wght@400;500;600&family=Quicksand:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/shopwise/bootstrap-icons/bootstrap-icons.min.css" />
        <link rel="stylesheet" href="/electro/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/electro/css/style.css" />
        <link rel="stylesheet" href="/electro/css/electro-extra.css" />
        <link rel="stylesheet" href="/shopwise/shopwise.css" />
        <link rel="stylesheet" href="/shopwise/shopwise-pages.css" />
        <OrganizationJsonLd />
        <LocalBusinessJsonLd />
        <WebsiteJsonLd />
      </head>
      <body suppressHydrationWarning>
        <SessionProvider>
          <ToastProvider>
            <ShopwiseHeader />
            <main>{children}</main>
            <ShopwiseFooter />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
