// Adresse du backend vue par le serveur Next.js : BACKEND_URL (Docker), sinon l'origine de NEXT_PUBLIC_API_URL
// (dev : http://localhost:3011/api -> http://localhost:3011)
const backendOrigin =
  process.env.BACKEND_URL ||
  (/^https?:\/\//.test(process.env.NEXT_PUBLIC_API_URL || '')
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:3001');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Ensure compatibility with older browsers including Safari
  transpilePackages: ['framer-motion'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['framer-motion'],
    // Cache de navigation côté navigateur : une page déjà visitée (ou préchargée) s'affiche instantanément
    // pendant cette durée (en secondes) au lieu de refaire un aller-retour au serveur.
    // Le panier, le compte et l'espace de gestion lisent leurs données côté client : ils restent à jour.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      // Photos des produits (fichiers du backend) ; en production nginx les sert sans passer par ici
      {
        source: '/uploads/:path*',
        destination: `${backendOrigin}/uploads/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
