import redis from './redis';

// Cache TTL in seconds
export const CACHE_TTL = {
  PRODUCTS: 300,      // 5 minutes
  PRODUCT: 300,       // 5 minutes
  RELATED: 300,       // 5 minutes
  ADVISOR: 86_400,    // 24 heures (vidé à chaque modification de produit ; prix et stock relus à chaque réponse)
};

// Cache key prefixes
export const CACHE_KEYS = {
  PRODUCTS: 'products',
  PRODUCT: 'product',
  RELATED: 'related',
  ADVISOR: 'advisor',
};

/**
 * Get cached data
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (data) {
      console.log(`Cache HIT: ${key}`);
      return JSON.parse(data) as T;
    }
    console.log(`Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set cached data with TTL
 */
export async function setCache<T>(key: string, data: T, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), { ex: ttl });
    console.log(`Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Delete cached data by key
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
    console.log(`Cache DELETE: ${key}`);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

/**
 * Delete cached data by pattern
 */
export async function deleteCacheByPattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      for (const key of keys) {
        await redis.del(key);
      }
      console.log(`Cache DELETE pattern: ${pattern} (${keys.length} keys)`);
    }
  } catch (error) {
    console.error('Cache delete pattern error:', error);
  }
}

/**
 * Invalidate all product caches
 */
export async function invalidateProductCache(): Promise<void> {
  await deleteCacheByPattern(`${CACHE_KEYS.PRODUCTS}:*`);
  await deleteCacheByPattern(`${CACHE_KEYS.PRODUCT}:*`);
  await deleteCacheByPattern(`${CACHE_KEYS.RELATED}:*`);
  await deleteCacheByPattern(`${CACHE_KEYS.ADVISOR}:*`);
}

/**
 * Generic cache wrapper function
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetchFn();

  // Store in cache
  await setCache(key, data, ttl);

  return data;
}
