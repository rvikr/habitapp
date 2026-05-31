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
  type: OfflineMutationType;
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

export type SendResult = { ok: true } | { ok: false; retry: boolean };

function isOfflineMutation(value: unknown): value is OfflineMutation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfflineMutation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.entityKey === "string" &&
    typeof candidate.type === "string" &&
    isOfflineMutationType(candidate.type) &&
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

  return a.type.localeCompare(b.type);
}

function newestMutation(a: OfflineMutation, b: OfflineMutation): OfflineMutation {
  return compareMutationTime(a, b) >= 0 ? a : b;
}

function isHabitMutation(mutation: OfflineMutation): boolean {
  return mutation.type === "habit.upsert" || mutation.type === "habit.archive";
}

function isCompletionMutation(mutation: OfflineMutation): boolean {
  return (
    mutation.type === "completion.set" ||
    mutation.type === "completion.increment" ||
    mutation.type === "completion.delete"
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
    if (mutation.type === "completion.set" || mutation.type === "completion.delete") {
      latestTerminal = latestTerminal ? newestMutation(latestTerminal, mutation) : mutation;
    }
  }

  const baseline = latestTerminal?.type === "completion.set" ? numericPayloadValue(latestTerminal) : 0;
  const increments = ordered.filter(
    (mutation) =>
      mutation.type === "completion.increment" &&
      (!latestTerminal || compareMutationTime(mutation, latestTerminal) > 0),
  );
  const incrementTotal = increments.reduce((total, mutation) => total + numericPayloadValue(mutation), 0);

  if (latestTerminal?.type === "completion.delete" && increments.length === 0) {
    return cloneMutation(latestTerminal);
  }

  if (latestTerminal) {
    const latestContributor = increments.reduce(
      (latest, mutation) => newestMutation(latest, mutation),
      latestTerminal,
    );
    return {
      ...cloneMutation(latestContributor),
      type: "completion.set",
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

export function createOfflineQueue(
  storage: OfflineQueueStorage,
  key = OFFLINE_QUEUE_STORAGE_KEY,
): OfflineQueue {
  return {
    async read() {
      const raw = await storage.getItem(key);
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
      await storage.setItem(key, JSON.stringify(cloned));
    },

    async enqueue(mutation) {
      const mutations = await this.read();
      mutations.push(cloneMutation(mutation));
      await this.replace(mutations);
    },
  };
}

export async function reconcileOfflineMutations(
  mutations: OfflineMutation[],
  send: (mutation: OfflineMutation) => Promise<SendResult>,
): Promise<OfflineMutation[]> {
  const compacted = compactOfflineMutations(mutations);
  const remaining: OfflineMutation[] = [];

  for (const mutation of compacted) {
    const result = await send(cloneMutation(mutation));
    if (!result.ok && result.retry) {
      remaining.push(cloneMutation(mutation));
    }
  }

  return remaining;
}
