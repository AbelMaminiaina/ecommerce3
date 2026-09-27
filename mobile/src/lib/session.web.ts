import type { Session, SessionStore } from '@tsena/shared';

// Aperçu web (développement uniquement) : expo-secure-store n'existe pas dans un navigateur.
// Session gardée le temps de l'onglet. Jamais embarqué dans l'application Android / iPhone (voir session.ts).

const SESSION_KEY = 'tsena.session';

export const sessionStore: SessionStore = {
  async get() {
    const raw = globalThis.sessionStorage?.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  async set(session) {
    globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  },
  async clear() {
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
  },
};
