export const AI_CACHE_EPOCH_KEY = "habbit:ai-cache-epoch";

type CacheEpochStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export async function readAiCacheEpoch(
  storage: Pick<CacheEpochStorage, "getItem"> | undefined,
): Promise<string> {
  const value = await storage?.getItem(AI_CACHE_EPOCH_KEY);
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : "0";
}

export async function bumpAiCacheEpoch(storage: CacheEpochStorage | undefined): Promise<void> {
  await storage?.setItem(AI_CACHE_EPOCH_KEY, `${Date.now().toString(36)}-${randomSuffix()}`);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
