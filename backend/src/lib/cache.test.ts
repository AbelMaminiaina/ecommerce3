import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis');

import redis from './redis';
import {
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPattern,
  invalidateProductCache,
  withCache,
  CACHE_KEYS,
} from './cache.js';

const redisMock = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCache', () => {
  it('returns parsed data on a cache hit', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

    const result = await getCache('key');

    expect(result).toEqual({ foo: 'bar' });
    expect(redisMock.get).toHaveBeenCalledWith('key');
  });

  it('returns null on a cache miss', async () => {
    redisMock.get.mockResolvedValue(null);

    const result = await getCache('key');

    expect(result).toBeNull();
  });

  it('returns null and swallows errors', async () => {
    redisMock.get.mockRejectedValue(new Error('redis down'));

    const result = await getCache('key');

    expect(result).toBeNull();
  });
});

describe('setCache', () => {
  it('serializes data and forwards the TTL', async () => {
    await setCache('key', { a: 1 }, 60);

    expect(redisMock.set).toHaveBeenCalledWith('key', JSON.stringify({ a: 1 }), { ex: 60 });
  });

  it('swallows errors', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'));

    await expect(setCache('key', { a: 1 }, 60)).resolves.toBeUndefined();
  });
});

describe('deleteCache', () => {
  it('deletes the given key', async () => {
    await deleteCache('key');
    expect(redisMock.del).toHaveBeenCalledWith('key');
  });
});

describe('deleteCacheByPattern', () => {
  it('deletes every key matching the pattern', async () => {
    redisMock.keys.mockResolvedValue(['products:list:a', 'products:list:b']);

    await deleteCacheByPattern('products:*');

    expect(redisMock.del).toHaveBeenCalledTimes(2);
    expect(redisMock.del).toHaveBeenCalledWith('products:list:a');
    expect(redisMock.del).toHaveBeenCalledWith('products:list:b');
  });

  it('does nothing when no keys match', async () => {
    redisMock.keys.mockResolvedValue([]);

    await deleteCacheByPattern('products:*');

    expect(redisMock.del).not.toHaveBeenCalled();
  });
});

describe('invalidateProductCache', () => {
  it('clears products, product, related and advisor caches', async () => {
    redisMock.keys.mockResolvedValue([]);

    await invalidateProductCache();

    expect(redisMock.keys).toHaveBeenCalledWith(`${CACHE_KEYS.PRODUCTS}:*`);
    expect(redisMock.keys).toHaveBeenCalledWith(`${CACHE_KEYS.PRODUCT}:*`);
    expect(redisMock.keys).toHaveBeenCalledWith(`${CACHE_KEYS.RELATED}:*`);
    expect(redisMock.keys).toHaveBeenCalledWith(`${CACHE_KEYS.ADVISOR}:*`);
  });
});

describe('withCache', () => {
  it('returns cached data without calling fetchFn on a hit', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ cached: true }));
    const fetchFn = vi.fn();

    const result = await withCache('key', 60, fetchFn);

    expect(result).toEqual({ cached: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('calls fetchFn and stores the result on a miss', async () => {
    redisMock.get.mockResolvedValue(null);
    const fetchFn = vi.fn().mockResolvedValue({ fresh: true });

    const result = await withCache('key', 60, fetchFn);

    expect(result).toEqual({ fresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalledWith('key', JSON.stringify({ fresh: true }), { ex: 60 });
  });
});
