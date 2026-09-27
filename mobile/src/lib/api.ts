import { createApiClient } from '@tsena/shared';
import { API_URL } from './config';
import { sessionStore } from './session';

// Client API unique de l'application : jeton ajouté à chaque appel, renouvelé sur 401 (voir @tsena/shared)

// Appelé quand la session ne peut plus être renouvelée ; le magasin de session (features/auth) s'y abonne
let onExpired: (() => void) | undefined;
export const setSessionExpiredHandler = (handler: () => void) => {
  onExpired = handler;
};

export const api = createApiClient({ baseUrl: API_URL, session: sessionStore, onSessionExpired: () => onExpired?.() });
