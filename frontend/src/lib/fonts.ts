import { Inter, Quicksand, Roboto } from 'next/font/google';

// Polices du thème ShopWise, hébergées par le site lui-même : next/font les télécharge une seule fois au build
// et les sert depuis /_next/static (aucune requête des visiteurs vers Google, pas de décalage à l'affichage).
// Chaque police expose une variable CSS utilisée par shopwise.css et admin-shopwise.css.

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-quicksand',
});

// À placer sur <html> dans chaque layout racine
export const fontVariables = `${roboto.variable} ${inter.variable} ${quicksand.variable}`;
