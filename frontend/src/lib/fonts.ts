import localFont from 'next/font/local';

// Polices du thème ShopWise, fournies avec le code (src/fonts, licence SIL OFL) : ni le build ni les visiteurs
// ne contactent Google. next/font les sert depuis /_next/static et génère des polices de repli ajustées
// (pas de décalage à l'affichage). Chaque police expose une variable CSS utilisée par shopwise.css et admin-shopwise.css.
// Fichiers « variables » : une seule source couvre toutes les graisses indiquées.

const roboto = localFont({
  src: '../fonts/roboto-latin.woff2',
  weight: '300 700',
  display: 'swap',
  variable: '--font-roboto',
});

const inter = localFont({
  src: '../fonts/inter-latin.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-inter',
});

const quicksand = localFont({
  src: '../fonts/quicksand-latin.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-quicksand',
});

// À placer sur <html> dans chaque layout racine
export const fontVariables = `${roboto.variable} ${inter.variable} ${quicksand.variable}`;
