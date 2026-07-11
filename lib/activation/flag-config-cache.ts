import type { FeatureFlagConfig } from "./contracts.ts";

type CacheOptions = {
  force?: boolean;
};

type FeatureFlagConfigCacheOptions = {
  load: (key: string) => Promise<FeatureFlagConfig>;
  now?: () => number;
  ttlMs?: number;
};

export function createFeatureFlagConfigCache({
  load,
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
}: FeatureFlagConfigCacheOptions) {
  const entries = new Map<string, { value: FeatureFlagConfig; readAt: number }>();
  const latestRequestIds = new Map<string, number>();

  function nextRequestId(key: string): number {
    const requestId = (latestRequestIds.get(key) ?? 0) + 1;
    latestRequestIds.set(key, requestId);
    return requestId;
  }

  return {
    async get(
      key: string,
      fallback: FeatureFlagConfig,
      options?: CacheOptions,
    ): Promise<FeatureFlagConfig> {
      const cached = entries.get(key);
      if (!options?.force && cached && now() - cached.readAt <= ttlMs) return cached.value;

      const requestId = nextRequestId(key);

      try {
        const value = await load(key);
        if (latestRequestIds.get(key) === requestId) {
          entries.set(key, { value, readAt: now() });
        }
        return value;
      } catch {
        if (latestRequestIds.get(key) === requestId) entries.delete(key);
        return fallback;
      }
    },
    clear(key?: string): void {
      if (key) {
        entries.delete(key);
        nextRequestId(key);
        return;
      }
      entries.clear();
      for (const cachedKey of latestRequestIds.keys()) nextRequestId(cachedKey);
    },
  };
}
