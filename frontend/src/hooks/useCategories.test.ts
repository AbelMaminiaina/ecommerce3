import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const sampleCategories = [
  { id: '1', name: 'Poulet', slug: 'poulet', order: 0, isActive: true },
  { id: '2', name: 'Poules', slug: 'poules', order: 1, isActive: true },
];

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('useCategories', () => {
  it('fetches categories once and exposes them with loading resolved', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ categories: sampleCategories }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useCategories } = await import('./useCategories');
    const { result } = renderHook(() => useCategories());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories).toEqual(sampleCategories);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests across hook instances', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ categories: sampleCategories }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useCategories } = await import('./useCategories');
    const first = renderHook(() => useCategories());
    const second = renderHook(() => useCategories());

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves to an empty array when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const { useCategories } = await import('./useCategories');
    const { result } = renderHook(() => useCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories).toEqual([]);
  });
});

describe('useProductCategories', () => {
  it('keeps only the active categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [
            { id: '1', name: 'Mobiles', slug: 'mobiles', order: 0, isActive: true },
            { id: '2', name: 'Archivée', slug: 'archivee', order: 1, isActive: false },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useProductCategories } = await import('./useCategories');
    const { result } = renderHook(() => useProductCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories.map((c) => c.slug)).toEqual(['mobiles']);
  });
});

describe('invalidateCategoriesCache', () => {
  it('forces the next call to refetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ categories: sampleCategories }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useCategories, invalidateCategoriesCache } = await import('./useCategories');

    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateCategoriesCache();

    const { result: second } = renderHook(() => useCategories());
    await waitFor(() => expect(second.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
