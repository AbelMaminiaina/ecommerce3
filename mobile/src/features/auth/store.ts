import { create } from 'zustand';
import {
  authApi,
  hasTieredPricing,
  type CompanySummary,
  type LoginInput,
  type RegisterCustomerInput,
  type User,
} from '@tsena/shared';
import { api, setSessionExpiredHandler } from '../../lib/api';
import { sessionStore } from '../../lib/session';

type Status = 'loading' | 'guest' | 'signed-in';

interface AuthState {
  status: Status;
  user: User | null;
  company: CompanySummary | null;
  /** Relit la session enregistrée au démarrage */
  restore: () => Promise<void>;
  login: (data: LoginInput) => Promise<void>;
  /** Crée un compte particulier puis connecte */
  register: (data: RegisterCustomerInput) => Promise<void>;
  /**
   * Connexion par code SMS. Numéro inconnu sans prénom ni nom : renvoie 'needs-profile' (le même code
   * resservira avec eux, et le compte particulier sera créé).
   */
  loginWithPhone: (data: { phone: string; code: string; firstName?: string; lastName?: string }) => Promise<'ok' | 'needs-profile'>;
  logout: () => Promise<void>;
  /** Mot de passe, ou code SMS pour un compte créé par téléphone */
  deleteAccount: (proof: { password: string } | { code: string }) => Promise<void>;
}

const signedOut = { status: 'guest' as const, user: null, company: null };

export const useAuth = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  company: null,

  restore: async () => {
    // Stockage illisible : on démarre en visiteur plutôt que de rester sur l'écran de démarrage
    const session = await sessionStore.get().catch(() => null);
    if (!session) return set(signedOut);
    try {
      const { user, company } = await authApi.me(api);
      set({ status: 'signed-in', user, company });
    } catch (error) {
      // Hors connexion : on ne déconnecte pas, l'écran de compte réessaiera
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 404) {
        await sessionStore.clear();
        set(signedOut);
      } else {
        set({ status: 'signed-in' });
      }
    }
  },

  login: async (data) => {
    const { token, refreshToken, user, company } = await authApi.login(api, data, 'mobile');
    await sessionStore.set({ token, refreshToken });
    set({ status: 'signed-in', user, company });
  },

  loginWithPhone: async (data) => {
    const result = await authApi.verifyPhone(api, data);
    if ('needsProfile' in result) return 'needs-profile';
    const { token, refreshToken, user, company } = result;
    await sessionStore.set({ token, refreshToken });
    // Connecté par son numéro : il est vérifié (suppression du compte possible par code SMS)
    set({ status: 'signed-in', user: { ...user, verifiedPhone: user.phone ?? data.phone }, company });
    return 'ok';
  },

  register: async (data) => {
    await authApi.register(api, data);
    const { token, refreshToken, user, company } = await authApi.login(api, { email: data.email, password: data.password }, 'mobile');
    await sessionStore.set({ token, refreshToken });
    set({ status: 'signed-in', user, company });
  },

  logout: async () => {
    const session = await sessionStore.get();
    await sessionStore.clear();
    set(signedOut);
    // Révocation côté serveur : sans réseau, le jeton expirera de lui-même
    if (session) authApi.logout(api, session).catch(() => undefined);
  },

  deleteAccount: async (proof) => {
    await authApi.deleteAccount(api, proof);
    await sessionStore.clear();
    set(signedOut);
  },
}));

// Session refusée par le serveur (renouvellement impossible) : retour à l'état visiteur
setSessionExpiredHandler(() => useAuth.setState(signedOut));

/** Paliers dégressifs : entreprise approuvée uniquement */
export const useTieredPricing = () => useAuth((s) => hasTieredPricing(s.user, s.company));
