import { fetchServerAPI } from './config';

// Profil public d'une entreprise vendeuse (aucune coordonnée privée : ni e-mail, ni téléphone)
export interface PublicSeller {
  id: string;
  name: string;
  legalName: string | null;
  memberSince: string;
  productCount: number;
  /** Responsable du compte, réduit à « Prénom N. » */
  contactPerson: string | null;
}

// Variantes serveur (Server Components) : elles passent par l'URL interne du backend
export async function fetchSellersOnServer(): Promise<PublicSeller[]> {
  try {
    const res = await fetchServerAPI('/sellers');
    if (!res.ok) return [];
    return ((await res.json()) as { sellers: PublicSeller[] }).sellers;
  } catch {
    return [];
  }
}

export async function fetchSellerOnServer(id: string): Promise<PublicSeller | null> {
  try {
    const res = await fetchServerAPI(`/sellers/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as PublicSeller;
  } catch {
    return null;
  }
}
