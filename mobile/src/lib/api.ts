import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createApiClient, type Session, type SessionStore } from '@tsena/shared';

const SESSION_KEY = 'tsena.session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3011/api';

// Jetons chiffrés par le système (Keychain iOS, Keystore Android), jamais en clair.
// expo-secure-store n'existe pas dans un navigateur : l'aperçu web (développement) garde la session le temps de l'onglet.
const storage =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key: string) => globalThis.sessionStorage?.getItem(key) ?? null,
        setItemAsync: async (key: string, value: string) => globalThis.sessionStorage?.setItem(key, value),
        deleteItemAsync: async (key: string) => globalThis.sessionStorage?.removeItem(key),
      }
    : SecureStore;

export const sessionStore: SessionStore = {
  async get() {
    const raw = await storage.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  set: (session) => storage.setItemAsync(SESSION_KEY, JSON.stringify(session)),
  clear: () => storage.deleteItemAsync(SESSION_KEY),
};

// Appelé quand la session ne peut plus être renouvelée ; l'écran de compte s'y abonne
let onExpired: (() => void) | undefined;
export const setSessionExpiredHandler = (handler: () => void) => {
  onExpired = handler;
};

export const api = createApiClient({ baseUrl: API_URL, session: sessionStore, onSessionExpired: () => onExpired?.() });
