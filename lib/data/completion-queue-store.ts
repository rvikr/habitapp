export type PendingCompletionOp = {
  id: string;
  kind: "complete" | "uncomplete" | "set_value" | "set_value_max" | "increment";
  habitId: string;
  userId: string;
  completedOn: string;
  // For "complete" a missing value means "resolve the habit's target at replay
  // time" (we were offline when the target lookup failed).
  value?: number;
  note?: string | null;
  queuedAt: string;
};

export type CompletionQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const STORAGE_KEY = "habbit:pending-completions";
const MAX_QUEUE_LENGTH = 200;

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

function parseQueue(raw: string | null): PendingCompletionOp[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingCompletionOp[]) : [];
  } catch {
    return [];
  }
}

function isPendingPositiveCompletion(op: PendingCompletionOp): boolean {
  if (op.kind === "uncomplete") return false;
  if (op.kind === "set_value_max") return op.value != null && op.value > 0;
  if (op.kind === "increment") return (op.value ?? 1) > 0;
  // A value-less complete/set_value resolves to the habit's positive target
  // during replay.
  return op.value == null || op.value > 0;
}

export function createCompletionQueueStore(storage: CompletionQueueStorage) {
  const runExclusive = createAsyncMutationLock();

  async function readUnlocked(): Promise<PendingCompletionOp[]> {
    return parseQueue(await storage.getItem(STORAGE_KEY));
  }

  async function writeUnlocked(queue: PendingCompletionOp[]): Promise<void> {
    if (queue.length === 0) await storage.removeItem(STORAGE_KEY);
    else await storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }

  return {
    read(): Promise<PendingCompletionOp[]> {
      return runExclusive(readUnlocked);
    },

    hasPendingPositive(userId: string): Promise<boolean> {
      return runExclusive(async () =>
        (await readUnlocked()).some(
          (op) => op.userId === userId && isPendingPositiveCompletion(op),
        ),
      );
    },

    enqueue(op: PendingCompletionOp): Promise<void> {
      return runExclusive(async () => {
        const queue = await readUnlocked();
        const next = queue.filter((item) => {
          if (item.habitId !== op.habitId || item.completedOn !== op.completedOn) return true;
          if (op.kind === "increment") return true;
          if (op.kind === "set_value_max") return item.kind !== "set_value_max";
          return false;
        });
        next.push(op);
        await writeUnlocked(next.slice(-MAX_QUEUE_LENGTH));
      });
    },

    removeIds(ids: readonly string[]): Promise<PendingCompletionOp[]> {
      if (ids.length === 0) return Promise.resolve([]);
      const idSet = new Set(ids);
      return runExclusive(async () => {
        const queue = await readUnlocked();
        const removed = queue.filter((op) => idSet.has(op.id));
        if (removed.length > 0) {
          await writeUnlocked(queue.filter((op) => !idSet.has(op.id)));
        }
        return removed;
      });
    },
  };
}
