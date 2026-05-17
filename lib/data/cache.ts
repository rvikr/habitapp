type CacheEntry<T> = {
  value: T;
  cachedAt: number;
};

type CacheOptions = {
  now?: () => number;
  force?: boolean;
};

const cache = new Map<string, CacheEntry<unknown>>();

function currentTime(options?: CacheOptions): number {
  return options?.now?.() ?? Date.now();
}

export function getCachedValue<T>(
  key: string,
  ttlMs: number,
  options?: Pick<CacheOptions, "now">,
): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (currentTime(options) - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedValue<T>(key: string, value: T, options?: Pick<CacheOptions, "now">): T {
  cache.set(key, { value, cachedAt: currentTime(options) });
  return value;
}

export async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  if (!options?.force) {
    const cached = getCachedValue<T>(key, ttlMs, options);
    if (cached !== null) return cached;
  }

  return setCachedValue(key, await load(), options);
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export const DATA_CACHE_PREFIX = "habbit:data:";

export function clearDataCache(): void {
  clearCache(DATA_CACHE_PREFIX);
}
