export type ActivationMarkerStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const OPTIMISTIC_FIRST_LOG_PREFIX = "habbit:activation:first-log:";

export function optimisticFirstLogKey(userId: string): string {
  return `${OPTIMISTIC_FIRST_LOG_PREFIX}${userId}`;
}

export function createOptimisticFirstLogStore(storage: ActivationMarkerStorage) {
  return {
    async has(userId: string): Promise<boolean> {
      try {
        return (await storage.getItem(optimisticFirstLogKey(userId))) === "1";
      } catch {
        return false;
      }
    },
    async mark(userId: string): Promise<void> {
      try {
        await storage.setItem(optimisticFirstLogKey(userId), "1");
      } catch {
        // Activation hints must never make a completion fail.
      }
    },
    async clear(userId: string): Promise<void> {
      try {
        await storage.removeItem(optimisticFirstLogKey(userId));
      } catch {
        // Best effort; an authoritative stage remains safe if cleanup fails.
      }
    },
  };
}
