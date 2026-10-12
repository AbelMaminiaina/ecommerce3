// Adresse publique du site (liens des e-mails, retour du client après une page de paiement externe)
export const siteUrl = (): string =>
  (process.env.PUBLIC_SITE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
