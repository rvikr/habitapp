export type PendingHabitMutation = {
  id: string;
  kind: "update" | "archive";
  habitId: string;
  userId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type HabitMutationFailureReason = "rejected" | "not_found" | "queue_full";

export type HabitMutationReconciliationFailure = {
  id: string;
  operationId: string;
  kind: PendingHabitMutation["kind"];
  habitId: string;
  userId: string;
  reason: HabitMutationFailureReason;
  code: string | null;
  queuedAt: string;
  failedAt: string;
};

export type HabitMutationQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type HabitMutationJournal = {
  version: 1;
  pending: PendingHabitMutation[];
  failures: HabitMutationReconciliationFailure[];
};

type FailureInput = {
  reason: Exclude<HabitMutationFailureReason, "queue_full">;
  code?: string | null;
  failedAt: string;
};

export const HABIT_MUTATION_JOURNAL_STORAGE_KEY = "habbit:pending-habit-mutations";
export const MAX_PENDING_HABIT_MUTATIONS = 100;
export const MAX_HABIT_RECONCILIATION_FAILURES = 20;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMutationKind(value: unknown): value is PendingHabitMutation["kind"] {
  return value === "update" || value === "archive";
}

function isPendingMutation(value: unknown): value is PendingHabitMutation {
  if (!isRecord(value) || !isRecord(value.payload)) return false;
  return (
    typeof value.id === "string" &&
    isMutationKind(value.kind) &&
    typeof value.habitId === "string" &&
    typeof value.userId === "string" &&
    typeof value.queuedAt === "string"
  );
}

function isFailureReason(value: unknown): value is HabitMutationFailureReason {
  return value === "rejected" || value === "not_found" || value === "queue_full";
}

function isReconciliationFailure(value: unknown): value is HabitMutationReconciliationFailure {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.operationId === "string" &&
    isMutationKind(value.kind) &&
    typeof value.habitId === "string" &&
    typeof value.userId === "string" &&
    isFailureReason(value.reason) &&
    (value.code === null || typeof value.code === "string") &&
    typeof value.queuedAt === "string" &&
    typeof value.failedAt === "string"
  );
}

function emptyJournal(): HabitMutationJournal {
  return { version: 1, pending: [], failures: [] };
}

function parseJournal(raw: string | null): HabitMutationJournal {
  if (!raw) return emptyJournal();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        version: 1,
        pending: parsed.filter(isPendingMutation).slice(-MAX_PENDING_HABIT_MUTATIONS),
        failures: [],
      };
    }
    if (!isRecord(parsed) || parsed.version !== 1) return emptyJournal();
    return {
      version: 1,
      pending: Array.isArray(parsed.pending)
        ? parsed.pending.filter(isPendingMutation).slice(-MAX_PENDING_HABIT_MUTATIONS)
        : [],
      failures: Array.isArray(parsed.failures)
        ? parsed.failures.filter(isReconciliationFailure).slice(-MAX_HABIT_RECONCILIATION_FAILURES)
        : [],
    };
  } catch {
    return emptyJournal();
  }
}

function safeCode(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(trimmed) ? trimmed : null;
}

function failureFor(
  operation: PendingHabitMutation,
  input: FailureInput | { reason: "queue_full"; failedAt: string },
): HabitMutationReconciliationFailure {
  return {
    id: operation.id,
    operationId: operation.id,
    kind: operation.kind,
    habitId: operation.habitId,
    userId: operation.userId,
    reason: input.reason,
    code: "code" in input ? safeCode(input.code) : null,
    queuedAt: operation.queuedAt,
    failedAt: input.failedAt,
  };
}

function appendFailure(
  failures: HabitMutationReconciliationFailure[],
  failure: HabitMutationReconciliationFailure,
): HabitMutationReconciliationFailure[] {
  const withoutSuperseded = failures.filter(
    (item) => item.userId !== failure.userId || item.habitId !== failure.habitId,
  );
  return [...withoutSuperseded, failure].slice(-MAX_HABIT_RECONCILIATION_FAILURES);
}

export function createHabitMutationQueueStore(
  storage: HabitMutationQueueStorage,
  options: { now?: () => string } = {},
) {
  const runExclusive = createAsyncMutationLock();
  const now = options.now ?? (() => new Date().toISOString());

  async function readJournalUnlocked(): Promise<HabitMutationJournal> {
    return parseJournal(await storage.getItem(HABIT_MUTATION_JOURNAL_STORAGE_KEY));
  }

  async function writeJournalUnlocked(journal: HabitMutationJournal): Promise<void> {
    if (journal.pending.length === 0 && journal.failures.length === 0) {
      await storage.removeItem(HABIT_MUTATION_JOURNAL_STORAGE_KEY);
    } else {
      await storage.setItem(HABIT_MUTATION_JOURNAL_STORAGE_KEY, JSON.stringify(journal));
    }
  }

  return {
    read(): Promise<PendingHabitMutation[]> {
      return runExclusive(async () => (await readJournalUnlocked()).pending);
    },

    enqueue(operation: PendingHabitMutation): Promise<void> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const previous = [...journal.pending]
          .reverse()
          .find((item) => item.habitId === operation.habitId && item.userId === operation.userId);
        const payload = { ...(previous?.payload ?? {}), ...operation.payload };
        const compacted: PendingHabitMutation = {
          ...operation,
          kind: typeof payload.archived_at === "string" ? "archive" : "update",
          payload,
        };
        const next = journal.pending.filter(
          (item) => item.habitId !== operation.habitId || item.userId !== operation.userId,
        );
        next.push(compacted);

        const overflowCount = Math.max(0, next.length - MAX_PENDING_HABIT_MUTATIONS);
        let failures = journal.failures;
        for (const overflowed of next.slice(0, overflowCount)) {
          failures = appendFailure(
            failures,
            failureFor(overflowed, { reason: "queue_full", failedAt: now() }),
          );
        }
        await writeJournalUnlocked({
          version: 1,
          pending: next.slice(overflowCount),
          failures,
        });
      });
    },

    removeIds(ids: readonly string[]): Promise<PendingHabitMutation[]> {
      if (ids.length === 0) return Promise.resolve([]);
      const idSet = new Set(ids);
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const removed = journal.pending.filter((operation) => idSet.has(operation.id));
        if (removed.length > 0) {
          await writeJournalUnlocked({
            ...journal,
            pending: journal.pending.filter((operation) => !idSet.has(operation.id)),
          });
        }
        return removed;
      });
    },

    settleSucceeded(operationId: string): Promise<PendingHabitMutation | null> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const operation = journal.pending.find((item) => item.id === operationId) ?? null;
        if (!operation) return null;
        await writeJournalUnlocked({
          version: 1,
          pending: journal.pending.filter((item) => item.id !== operationId),
          failures: journal.failures.filter(
            (failure) =>
              failure.userId !== operation.userId || failure.habitId !== operation.habitId,
          ),
        });
        return operation;
      });
    },

    settleRejected(
      operationId: string,
      input: FailureInput,
    ): Promise<HabitMutationReconciliationFailure | null> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const operation = journal.pending.find((item) => item.id === operationId) ?? null;
        if (!operation) return null;
        const failure = failureFor(operation, input);
        await writeJournalUnlocked({
          version: 1,
          pending: journal.pending.filter((item) => item.id !== operationId),
          failures: appendFailure(journal.failures, failure),
        });
        return failure;
      });
    },

    readFailures(userId: string, habitId?: string): Promise<HabitMutationReconciliationFailure[]> {
      return runExclusive(async () => {
        const { failures } = await readJournalUnlocked();
        return failures.filter(
          (failure) => failure.userId === userId && (!habitId || failure.habitId === habitId),
        );
      });
    },

    acknowledgeFailures(
      userId: string,
      ids: readonly string[],
    ): Promise<HabitMutationReconciliationFailure[]> {
      if (ids.length === 0) return Promise.resolve([]);
      const idSet = new Set(ids);
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const acknowledged = journal.failures.filter(
          (failure) => failure.userId === userId && idSet.has(failure.id),
        );
        if (acknowledged.length > 0) {
          await writeJournalUnlocked({
            ...journal,
            failures: journal.failures.filter(
              (failure) => failure.userId !== userId || !idSet.has(failure.id),
            ),
          });
        }
        return acknowledged;
      });
    },
  };
}

type HabitMutationQueueStore = ReturnType<typeof createHabitMutationQueueStore>;
type SendHabitMutationResult =
  | { ok: true }
  | {
      ok: false;
      retry: boolean;
      reason?: Exclude<HabitMutationFailureReason, "queue_full">;
      code?: string | null;
    };

export async function reconcileHabitMutationQueue(options: {
  store: HabitMutationQueueStore;
  userId: string;
  send(operation: PendingHabitMutation): Promise<SendHabitMutationResult>;
  failedAt?: () => string;
}): Promise<{
  succeeded: PendingHabitMutation[];
  rejected: HabitMutationReconciliationFailure[];
}> {
  const succeeded: PendingHabitMutation[] = [];
  const rejected: HabitMutationReconciliationFailure[] = [];
  const failedAt = options.failedAt ?? (() => new Date().toISOString());

  while (true) {
    const queue = await options.store.read();
    const operation = queue.find((item) => item.userId === options.userId);
    if (!operation) break;

    let result: SendHabitMutationResult;
    try {
      result = await options.send(operation);
    } catch {
      break;
    }
    if (!result.ok && result.retry) break;
    if (!result.ok) {
      const failure = await options.store.settleRejected(operation.id, {
        reason: result.reason ?? "rejected",
        code: result.code,
        failedAt: failedAt(),
      });
      if (failure) rejected.push(failure);
      continue;
    }

    const settled = await options.store.settleSucceeded(operation.id);
    if (settled) succeeded.push(settled);
  }

  return { succeeded, rejected };
}
