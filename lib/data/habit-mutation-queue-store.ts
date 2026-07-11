export type PendingHabitMutation = {
  id: string;
  kind: "update" | "archive";
  habitId: string;
  userId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type HabitMutationQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const STORAGE_KEY = "habbit:pending-habit-mutations";
const MAX_QUEUE_LENGTH = 100;

function createAsyncMutationLock() {
  let tail = Promise.resolve();

  return async function runExclusive<T>(mutation: () => Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await mutation();
    } finally {
      release();
    }
  };
}

function parseQueue(raw: string | null): PendingHabitMutation[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingHabitMutation[]) : [];
  } catch {
    return [];
  }
}

export function createHabitMutationQueueStore(storage: HabitMutationQueueStorage) {
  const runExclusive = createAsyncMutationLock();

  async function readUnlocked(): Promise<PendingHabitMutation[]> {
    return parseQueue(await storage.getItem(STORAGE_KEY));
  }

  async function writeUnlocked(queue: PendingHabitMutation[]): Promise<void> {
    if (queue.length === 0) await storage.removeItem(STORAGE_KEY);
    else await storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }

  return {
    read(): Promise<PendingHabitMutation[]> {
      return runExclusive(readUnlocked);
    },

    enqueue(operation: PendingHabitMutation): Promise<void> {
      return runExclusive(async () => {
        const queue = await readUnlocked();
        const previous = [...queue]
          .reverse()
          .find((item) => item.habitId === operation.habitId && item.userId === operation.userId);
        const payload = { ...(previous?.payload ?? {}), ...operation.payload };
        const compacted: PendingHabitMutation = {
          ...operation,
          kind: typeof payload.archived_at === "string" ? "archive" : "update",
          payload,
        };
        const next = queue.filter(
          (item) => item.habitId !== operation.habitId || item.userId !== operation.userId,
        );
        next.push(compacted);
        await writeUnlocked(next.slice(-MAX_QUEUE_LENGTH));
      });
    },

    removeIds(ids: readonly string[]): Promise<PendingHabitMutation[]> {
      if (ids.length === 0) return Promise.resolve([]);
      const idSet = new Set(ids);
      return runExclusive(async () => {
        const queue = await readUnlocked();
        const removed = queue.filter((operation) => idSet.has(operation.id));
        if (removed.length > 0) {
          await writeUnlocked(queue.filter((operation) => !idSet.has(operation.id)));
        }
        return removed;
      });
    },
  };
}
