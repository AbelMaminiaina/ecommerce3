// Adresse publique du site (sans « / » final), pour les URL absolues : SEO, données structurées, sitemap.
// NEXT_PUBLIC_SITE_URL si elle est définie, sinon le domaine de production.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://tsenapro.mg').replace(/\/$/, '');
