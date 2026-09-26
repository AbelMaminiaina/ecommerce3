import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../../lib/storage';

// Commandes passées sans compte : l'e-mail saisi sert à suivre le paiement (numéro + e-mail)
interface GuestOrdersState {
  emails: Record<string, string>;
  remember: (orderNumber: string, email: string) => void;
}

export const useGuestOrders = create<GuestOrdersState>()(
  persist(
    (set, get) => ({
      emails: {},
      remember: (orderNumber, email) => set({ emails: { ...get().emails, [orderNumber]: email } }),
    }),
    { name: 'tsena.guest-orders', storage: persistStorage }
  )
);
