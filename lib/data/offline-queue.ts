export const OFFLINE_QUEUE_STORAGE_KEY = "habbit:offline-mutation-queue";

export type OfflineMutationType =
  | "habit.upsert"
  | "habit.archive"
  | "completion.set"
  | "completion.increment"
  | "completion.delete";

export type OfflineMutation = {
  id: string;
  entityKey: string;
  operation: OfflineMutationType;
  payload: Record<string, unknown>;
  createdAt: string;
  clientUpdatedAt: string;
};

type OfflineQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

export type OfflineQueue = {
  read(): Promise<OfflineMutation[]>;
  replace(mutations: readonly OfflineMutation[]): Promise<void>;
  enqueue(mutation: OfflineMutation): Promise<void>;
};

export type ReconcileOfflineMutationsResult = {
  sent: number;
  removed: number;
  remaining: number;
};

function isOfflineMutation(value: unknown): value is OfflineMutation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfflineMutation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.entityKey === "string" &&
    typeof candidate.operation === "string" &&
    isOfflineMutationType(candidate.operation) &&
    candidate.payload !== null &&
    typeof candidate.payload === "object" &&
    !Array.isArray(candidate.payload) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.clientUpdatedAt === "string"
  );
}

function isOfflineMutationType(value: string): value is OfflineMutationType {
  return (
    value === "habit.upsert" ||
    value === "habit.archive" ||
    value === "completion.set" ||
    value === "completion.increment" ||
    value === "completion.delete"
  );
}

function cloneMutation(mutation: OfflineMutation): OfflineMutation {
  return {
    ...mutation,
    payload: { ...mutation.payload },
  };
}

function compareMutationTime(a: OfflineMutation, b: OfflineMutation): number {
  const clientUpdatedAt = a.clientUpdatedAt.localeCompare(b.clientUpdatedAt);
  if (clientUpdatedAt !== 0) return clientUpdatedAt;

  const createdAt = a.createdAt.localeCompare(b.createdAt);
  if (createdAt !== 0) return createdAt;

  return a.id.localeCompare(b.id);
}

function compareMutationOrder(a: OfflineMutation, b: OfflineMutation): number {
  const time = compareMutationTime(a, b);
  if (time !== 0) return time;

  const entityKey = a.entityKey.localeCompare(b.entityKey);
  if (entityKey !== 0) return entityKey;

  return a.operation.localeCompare(b.operation);
}

function newestMutation(a: OfflineMutation, b: OfflineMutation): OfflineMutation {
  return compareMutationTime(a, b) >= 0 ? a : b;
}

function isHabitMutation(mutation: OfflineMutation): boolean {
  return mutation.operation === "habit.upsert" || mutation.operation === "habit.archive";
}

function isCompletionMutation(mutation: OfflineMutation): boolean {
  return (
    mutation.operation === "completion.set" ||
    mutation.operation === "completion.increment" ||
    mutation.operation === "completion.delete"
  );
}

function numericPayloadValue(mutation: OfflineMutation): number {
  return typeof mutation.payload.value === "number" && Number.isFinite(mutation.payload.value)
    ? mutation.payload.value
    : 0;
}

function compactCompletionMutations(mutations: readonly OfflineMutation[]): OfflineMutation {
  const ordered = [...mutations].sort(compareMutationTime);
  let latestTerminal: OfflineMutation | null = null;

  for (const mutation of ordered) {
    if (mutation.operation === "completion.set" || mutation.operation === "completion.delete") {
      latestTerminal = latestTerminal ? newestMutation(latestTerminal, mutation) : mutation;
    }
  }

  const baseline = latestTerminal?.operation === "completion.set" ? numericPayloadValue(latestTerminal) : 0;
  const increments = ordered.filter(
    (mutation) =>
      mutation.operation === "completion.increment" &&
      (!latestTerminal || compareMutationTime(mutation, latestTerminal) > 0),
  );
  const incrementTotal = increments.reduce((total, mutation) => total + numericPayloadValue(mutation), 0);

  if (latestTerminal?.operation === "completion.delete" && increments.length === 0) {
    return cloneMutation(latestTerminal);
  }

  if (latestTerminal) {
    const latestContributor = increments.reduce(
      (latest, mutation) => newestMutation(latest, mutation),
      latestTerminal,
    );
    return {
      ...cloneMutation(latestContributor),
      operation: "completion.set",
      payload: {
        ...latestContributor.payload,
        value: baseline + incrementTotal,
      },
    };
  }

  const latestIncrement = increments.reduce((latest, mutation) => newestMutation(latest, mutation));
  return {
    ...cloneMutation(latestIncrement),
    payload: {
      ...latestIncrement.payload,
      value: incrementTotal,
    },
  };
}

export function compactOfflineMutations(mutations: readonly OfflineMutation[]): OfflineMutation[] {
  const habits = new Map<string, OfflineMutation>();
  const completions = new Map<string, OfflineMutation[]>();
  const others: OfflineMutation[] = [];

  for (const mutation of mutations) {
    if (isHabitMutation(mutation)) {
      const current = habits.get(mutation.entityKey);
      habits.set(mutation.entityKey, current ? newestMutation(current, mutation) : mutation);
    } else if (isCompletionMutation(mutation)) {
      const group = completions.get(mutation.entityKey) ?? [];
      group.push(mutation);
      completions.set(mutation.entityKey, group);
    } else {
      others.push(mutation);
    }
  }

  return [
    ...Array.from(habits.values(), cloneMutation),
    ...Array.from(completions.values(), compactCompletionMutations),
    ...others.map(cloneMutation),
  ].sort(compareMutationOrder);
}

export function createOfflineQueue(storage: OfflineQueueStorage): OfflineQueue {
  return {
    async read() {
      const raw = await storage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      if (!raw) return [];

      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isOfflineMutation).map(cloneMutation);
      } catch {
        return [];
      }
    },

    async replace(mutations) {
      const cloned = mutations.map(cloneMutation);
      await storage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(cloned));
    },

    async enqueue(mutation) {
      const mutations = await this.read();
      mutations.push(cloneMutation(mutation));
      await this.replace(mutations);
    },
  };
}

function isPermanentFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { permanent?: unknown; status?: unknown; code?: unknown };
  return (
    candidate.permanent === true ||
    candidate.status === 400 ||
    candidate.status === 422 ||
    candidate.code === "VALIDATION_FAILED"
  );
}

export async function reconcileOfflineMutations(
  queue: OfflineQueue,
  send: (mutation: OfflineMutation) => Promise<void>,
): Promise<ReconcileOfflineMutationsResult> {
  const compacted = compactOfflineMutations(await queue.read());
  const remaining: OfflineMutation[] = [];
  let sent = 0;
  let removed = 0;

  for (const mutation of compacted) {
    try {
      await send(cloneMutation(mutation));
      sent++;
    } catch (error) {
      if (isPermanentFailure(error)) {
        removed++;
      } else {
        remaining.push(mutation);
      }
    }
  }

  await queue.replace(remaining);

  return {
    sent,
    removed,
    remaining: remaining.length,
  };
}
