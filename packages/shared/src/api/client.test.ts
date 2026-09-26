import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type SessionStore } from './client';
import type { Session } from '../types';

function memoryStore(initial: Session | null): SessionStore & { value: Session | null } {
  const store = {
    value: initial,
    get: async () => store.value,
    set: async (s: Session) => {
      store.value = s;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createApiClient', () => {
  it('envoie le jeton et renvoie le JSON', async () => {
    const fetch = vi.fn(async () => json(200, { ok: true }));
    const api = createApiClient({ baseUrl: 'https://x.test/api/', session: memoryStore({ token: 'a', refreshToken: 'r' }), fetch });

    await expect(api.request('/auth/me')).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/api/auth/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a');
  });

  it("lève une ApiError avec le message du serveur", async () => {
    const api = createApiClient({ baseUrl: 'https://x.test/api', fetch: async () => json(400, { error: 'Données invalides' }) });
    await expect(api.request('/checkout')).rejects.toMatchObject({ message: 'Données invalides', status: 400 });
    await expect(api.request('/checkout')).rejects.toBeInstanceOf(ApiError);
  });

  it('renouvelle une seule fois pour des requêtes simultanées, puis les rejoue', async () => {
    const store = memoryStore({ token: 'old', refreshToken: 'r1' });
    let refreshCalls = 0;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { token: 'new', refreshToken: 'r2' });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, { url }) : json(401, { error: 'Jeton expiré' });
    });
    const api = createApiClient({ baseUrl: 'https://x.test/api', session: store, fetch: fetch as typeof globalThis.fetch });

    const results = await Promise.all([api.request('/a'), api.request('/b'), api.request('/c')]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    expect(store.value).toEqual({ token: 'new', refreshToken: 'r2' });
  });

  it('efface la session et prévient quand le renouvellement est refusé', async () => {
    const store = memoryStore({ token: 'old', refreshToken: 'r1' });
    const onSessionExpired = vi.fn();
    const api = createApiClient({
      baseUrl: 'https://x.test/api',
      session: store,
      onSessionExpired,
      fetch: async () => json(401, { error: 'Session expirée, reconnectez-vous' }),
    });

    await expect(api.request('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(store.value).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('garde la session si le serveur est injoignable pendant le renouvellement', async () => {
    const store = memoryStore({ token: 'old', refreshToken: 'r1' });
    const api = createApiClient({
      baseUrl: 'https://x.test/api',
      session: store,
      fetch: async (url) => (String(url).endsWith('/auth/refresh') ? json(503) : json(401)),
    });

    await expect(api.request('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(store.value).toEqual({ token: 'old', refreshToken: 'r1' });
  });

  it('rend absolues les adresses « /uploads/… »', () => {
    const api = createApiClient({ baseUrl: 'https://x.test/api' });
    expect(api.assetUrl('/uploads/a.webp')).toBe('https://x.test/uploads/a.webp');
    expect(api.assetUrl('https://cdn.test/b.png')).toBe('https://cdn.test/b.png');
    expect(api.assetUrl('')).toBeNull();
  });
});
