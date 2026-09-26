import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@tsena/shared';
import { persistStorage } from '../../lib/storage';

// Favoris gardés sur l'appareil. On garde le produit entier : l'écran Favoris s'affiche sans appel à l'API
// (et hors connexion) ; la fiche produit relit toujours le prix et le stock à jour.
interface WishlistState {
  products: Product[];
  toggle: (product: Product) => void;
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      products: [],
      toggle: (product) => {
        const list = get().products;
        set({
          products: list.some((p) => p.id === product.id)
            ? list.filter((p) => p.id !== product.id)
            : [product, ...list],
        });
      },
    }),
    { name: 'tsena.wishlist', storage: persistStorage }
  )
);

export const useIsFavorite = (productId: string) => useWishlist((s) => s.products.some((p) => p.id === productId));
