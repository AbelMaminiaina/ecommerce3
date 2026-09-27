import * as SecureStore from 'expo-secure-store';
import type { Session, SessionStore } from '@tsena/shared';

// Jetons de session chiffrés par le système (Keychain iOS, Keystore Android), jamais en clair.
// L'aperçu web utilise session.web.ts à la place : Metro choisit le fichier selon la plateforme,
// ce code-ci n'est donc jamais embarqué dans la version web, et inversement.

const SESSION_KEY = 'tsena.session';

export const sessionStore: SessionStore = {
  async get() {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  set: (session) => SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)),
  clear: () => SecureStore.deleteItemAsync(SESSION_KEY),
};
