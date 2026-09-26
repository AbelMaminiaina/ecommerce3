// Client HTTP de l'API Tsena Pro, indépendant de la plateforme (fetch standard).
// Sur mobile, il gère la session renouvelable (ARCHITECTURE-MOBILE.md §4) : sur une réponse 401, il appelle
// POST /auth/refresh une seule fois — même si plusieurs requêtes échouent en même temps — puis rejoue la requête.

import type { Session } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Où le client lit et range les jetons (expo-secure-store sur mobile) */
export interface SessionStore {
  get(): Promise<Session | null>;
  set(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  /** Adresse de l'API, avec « /api » (ex. https://xxxx.trycloudflare.com/api) */
  baseUrl: string;
  /** Absent : appels anonymes uniquement (pas de jeton, pas de renouvellement) */
  session?: SessionStore;
  /** Appelé quand la session ne peut plus être renouvelée : l'application renvoie vers la connexion */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Objet envoyé en JSON, ou FormData (envoi de photo) */
  body?: unknown;
  /** false : n'envoie pas le jeton même si une session existe */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  /** Origine du serveur (sans « /api »), pour les chemins relatifs « /uploads/… » */
  readonly origin: string;
  /** Adresse absolue d'une image renvoyée par l'API */
  assetUrl(path: string | null | undefined): string | null;
}

export function createApiClient({ baseUrl, session, onSessionExpired, fetch: fetchImpl }: ApiClientOptions): ApiClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = baseUrl.replace(/\/+$/, '');
  const origin = base.replace(/\/api$/, '');
  let refreshing: Promise<Session | null> | null = null;

  async function send(endpoint: string, options: RequestOptions, token: string | undefined): Promise<Response> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return doFetch(`${base}${endpoint}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
      signal: options.signal,
    });
  }

  // Un seul renouvellement à la fois : les requêtes simultanées attendent le même résultat
  function refreshSession(expired: Session): Promise<Session | null> {
    if (!session) return Promise.resolve(null);
    refreshing ??= (async () => {
      try {
        const current = await session.get();
        // Une autre requête a déjà renouvelé la session pendant que celle-ci attendait
        if (current && current.token !== expired.token) return current;
        if (!current) return null;

        const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken: current.refreshToken } }, undefined);
        if (!res.ok) {
          // 401 = jeton refusé (expiré, révoqué, réutilisé) ; autre erreur = serveur injoignable : on garde la session
          if (res.status === 401) {
            await session.clear();
            onSessionExpired?.();
          }
          return null;
        }
        const next = (await res.json()) as Session;
        await session.set(next);
        return next;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const current = options.auth === false || !session ? null : await session.get();
    let res = await send(endpoint, options, current?.token);

    if (res.status === 401 && current) {
      const renewed = await refreshSession(current);
      if (renewed) res = await send(endpoint, options, renewed.token);
    }

    if (!res.ok) {
      let message = `Erreur ${res.status}`;
      let details: unknown;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
        details = body?.details;
      } catch {
        // corps non JSON : message générique
      }
      throw new ApiError(message, res.status, details);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    origin,
    assetUrl(path) {
      if (!path) return null;
      return /^https?:\/\//i.test(path) ? path : `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
    },
  };
}
