import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  addCartItem,
  cartItemFromProduct,
  removeCartItem,
  sanitizeCartItems,
  setCartQuantity,
  type CartItem,
  type Product,
} from '@tsena/shared';
import { persistStorage } from '../../lib/storage';

interface CartState {
  items: CartItem[];
  add: (product: Product, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

// Panier local (utilisable hors connexion), mêmes règles que le site grâce à @tsena/shared
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product, quantity) => set({ items: addCartItem(get().items, cartItemFromProduct(product, quantity)) }),
      setQuantity: (productId, quantity) => set({ items: setCartQuantity(get().items, productId, quantity) }),
      remove: (productId) => set({ items: removeCartItem(get().items, productId) }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'tsena.cart',
      storage: persistStorage,
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => ({
        ...current,
        items: sanitizeCartItems((persisted as { items?: unknown } | undefined)?.items),
      }),
    }
  )
);

/** Nombre de lignes, pour le badge de l'onglet */
export const useCartCount = () => useCart((s) => s.items.length);
