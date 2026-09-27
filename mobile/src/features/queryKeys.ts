import type { ProductQuery } from '@tsena/shared';

// Clés du cache TanStack Query, en un seul endroit : un écran ne les écrit jamais à la main.
// La première valeur de chaque clé désigne le domaine (sert aux invalidations et à la persistance hors connexion).
export const queryKeys = {
  categories: () => ['categories'] as const,
  products: {
    all: () => ['products'] as const,
    /** Une page simple (accueil) : clé distincte du défilement infini, dont les données n'ont pas la même forme */
    latest: (limit: number) => ['products', 'latest', limit] as const,
    list: (filters: Omit<ProductQuery, 'page'>) => ['products', 'list', filters] as const,
  },
  product: (slug: string) => ['product', slug] as const,
  reviews: (slug: string) => ['reviews', slug] as const,
  orders: {
    all: () => ['orders'] as const,
    mine: () => ['orders', 'mine'] as const,
  },
  payment: {
    methods: () => ['payment', 'methods'] as const,
    status: (orderNumber: string, email?: string) => ['payment', 'status', orderNumber, email ?? null] as const,
    attempt: (attemptId: string | null) => ['payment', 'attempt', attemptId] as const,
    attempts: () => ['payment', 'attempt'] as const,
  },
};

/** Données publiques gardées sur l'appareil pour la consultation hors connexion (jamais commandes ni paiements) */
export const OFFLINE_QUERY_ROOTS = ['categories', 'products', 'product'] as const;
