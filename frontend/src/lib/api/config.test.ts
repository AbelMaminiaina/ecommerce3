import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAPI } from './config';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAPI', () => {
  it('requests the configured base URL and endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAPI('/products');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/products',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
    );
  });

  it('lets the browser set the multipart Content-Type when sending a file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: '/uploads/a.webp' }) });
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.append('image', new Blob(['x'], { type: 'image/jpeg' }), 'a.jpg');

    await fetchAPI('/uploads', { method: 'POST', body, token: 'tok' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(body);
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('returns the parsed JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ hello: 'world' }) })
    );

    const result = await fetchAPI<{ hello: string }>('/products');

    expect(result).toEqual({ hello: 'world' });
  });

  it('forwards the caller-supplied method and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAPI('/checkout', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ a: 1 }),
      })
    );
  });

  it('merges caller-supplied headers with the default Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAPI('/checkout', { headers: { Authorization: 'Bearer token' } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    });
  });

  it('injects an Authorization header when a token is passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAPI('/checkout/orders/mine', { token: 'jwt-token' });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer jwt-token' })
    );
  });

  it('throws an error with the status when the response is not ok and has no JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.reject(new Error('no body')),
      })
    );

    await expect(fetchAPI('/products/missing')).rejects.toThrow('API Error: 404 Not Found');
  });

  it('surfaces the backend error message when the response body has one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Quantité minimum non atteinte' }),
      })
    );

    await expect(fetchAPI('/checkout')).rejects.toThrow('Quantité minimum non atteinte');
  });
});

describe('SERVER_API_BASE_URL', () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalBackendUrl === undefined) {
      delete process.env.BACKEND_URL;
    } else {
      process.env.BACKEND_URL = originalBackendUrl;
    }
  });

  it('uses BACKEND_URL (internal Docker network) when set, so Server Components skip the public domain', async () => {
    process.env.BACKEND_URL = 'http://backend:3001';

    const { SERVER_API_BASE_URL } = await import('./config');

    expect(SERVER_API_BASE_URL).toBe('http://backend:3001/api');
  });

  it('falls back to the public API_BASE_URL when BACKEND_URL is not set (e.g. local dev)', async () => {
    delete process.env.BACKEND_URL;

    const { SERVER_API_BASE_URL, API_BASE_URL } = await import('./config');

    expect(SERVER_API_BASE_URL).toBe(API_BASE_URL);
  });
});
