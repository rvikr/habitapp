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
  // Null identifies a journal entry written before field provenance existed.
  // Such a warning is kept until a full confirmed write or user dismissal.
  failedFields: string[] | null;
};

export type HabitMutationSupersessionBoundary = {
  userId: string;
  habitId: string;
  pendingFields: {
    operationId: string;
    fieldOrigins: Record<string, string>;
  }[];
  failureIds: string[];
};

export type HabitMutationQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StoredPendingHabitMutation = PendingHabitMutation & {
  // Compaction keeps the last operation id that explicitly wrote each field.
  // A confirmed partial server write can then remove inherited stale fields
  // without discarding a same-field replacement queued while it was in flight.
  fieldOrigins: Record<string, string>;
};

type HabitMutationJournal = {
  version: 1;
  pending: StoredPendingHabitMutation[];
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

function parsePendingMutation(value: unknown): StoredPendingHabitMutation | null {
  if (
    !isRecord(value) ||
    !isRecord(value.payload) ||
    typeof value.id !== "string" ||
    !isMutationKind(value.kind) ||
    typeof value.habitId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.queuedAt !== "string"
  ) {
    return null;
  }
  const storedOrigins = isRecord(value.fieldOrigins) ? value.fieldOrigins : {};
  const fieldOrigins: Record<string, string> = {};
  for (const key of Object.keys(value.payload)) {
    fieldOrigins[key] =
      typeof storedOrigins[key] === "string" && storedOrigins[key] ? storedOrigins[key] : value.id;
  }
  return {
    id: value.id,
    kind: value.kind,
    habitId: value.habitId,
    userId: value.userId,
    payload: value.payload,
    queuedAt: value.queuedAt,
    fieldOrigins,
  };
}

function parsePendingList(value: unknown): StoredPendingHabitMutation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parsePendingMutation)
    .filter((operation): operation is StoredPendingHabitMutation => operation !== null)
    .slice(-MAX_PENDING_HABIT_MUTATIONS);
}

function publicPendingMutation(operation: StoredPendingHabitMutation): PendingHabitMutation {
  const { fieldOrigins: _fieldOrigins, ...pending } = operation;
  return pending;
}

function isFailureReason(value: unknown): value is HabitMutationFailureReason {
  return value === "rejected" || value === "not_found" || value === "queue_full";
}

function parseReconciliationFailure(value: unknown): HabitMutationReconciliationFailure | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.operationId !== "string" ||
    !isMutationKind(value.kind) ||
    typeof value.habitId !== "string" ||
    typeof value.userId !== "string" ||
    !isFailureReason(value.reason) ||
    (value.code !== null && typeof value.code !== "string") ||
    typeof value.queuedAt !== "string" ||
    typeof value.failedAt !== "string"
  ) {
    return null;
  }
  const failedFields = Array.isArray(value.failedFields)
    ? [...new Set(value.failedFields)]
        .filter((field): field is string => typeof field === "string" && field.length <= 128)
        .sort()
        .slice(0, 64)
    : null;
  return {
    id: value.id,
    operationId: value.operationId,
    kind: value.kind,
    habitId: value.habitId,
    userId: value.userId,
    reason: value.reason,
    code: value.code,
    queuedAt: value.queuedAt,
    failedAt: value.failedAt,
    failedFields,
  };
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
        pending: parsePendingList(parsed),
        failures: [],
      };
    }
    if (!isRecord(parsed) || parsed.version !== 1) return emptyJournal();
    return {
      version: 1,
      pending: parsePendingList(parsed.pending),
      failures: Array.isArray(parsed.failures)
        ? parsed.failures
            .map(parseReconciliationFailure)
            .filter((failure): failure is HabitMutationReconciliationFailure => failure !== null)
            .slice(-MAX_HABIT_RECONCILIATION_FAILURES)
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
    failedFields: Object.keys(operation.payload).sort(),
  };
}

function appendFailure(
  failures: HabitMutationReconciliationFailure[],
  failure: HabitMutationReconciliationFailure,
): HabitMutationReconciliationFailure[] {
  const sameScope = failures.filter(
    (item) => item.userId === failure.userId && item.habitId === failure.habitId,
  );
  const failedFields = sameScope.some((item) => item.failedFields === null)
    ? null
    : [
        ...new Set([
          ...(failure.failedFields ?? []),
          ...sameScope.flatMap((item) => item.failedFields ?? []),
        ]),
      ]
        .sort()
        .slice(0, 64);
  const withoutSuperseded = failures.filter(
    (item) => item.userId !== failure.userId || item.habitId !== failure.habitId,
  );
  return [...withoutSuperseded, { ...failure, failedFields }].slice(
    -MAX_HABIT_RECONCILIATION_FAILURES,
  );
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
      return runExclusive(async () =>
        (await readJournalUnlocked()).pending.map(publicPendingMutation),
      );
    },

    enqueue(operation: PendingHabitMutation): Promise<PendingHabitMutation> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const previous = [...journal.pending]
          .reverse()
          .find((item) => item.habitId === operation.habitId && item.userId === operation.userId);
        const payload = { ...(previous?.payload ?? {}), ...operation.payload };
        const fieldOrigins = { ...(previous?.fieldOrigins ?? {}) };
        for (const key of Object.keys(operation.payload)) fieldOrigins[key] = operation.id;
        const compacted: StoredPendingHabitMutation = {
          ...operation,
          kind: typeof payload.archived_at === "string" ? "archive" : "update",
          payload,
          fieldOrigins,
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
        return publicPendingMutation(compacted);
      });
    },

    replacePayload(
      operationId: string,
      payload: Record<string, unknown>,
    ): Promise<PendingHabitMutation | null> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const index = journal.pending.findIndex((operation) => operation.id === operationId);
        if (index < 0) return null;
        const current = journal.pending[index];
        const replacement: StoredPendingHabitMutation = {
          ...current,
          kind: typeof payload.archived_at === "string" ? "archive" : "update",
          payload,
          fieldOrigins: Object.fromEntries(
            Object.keys(payload).map((field) => [field, current.id]),
          ),
        };
        const pending = [...journal.pending];
        pending[index] = replacement;
        await writeJournalUnlocked({ ...journal, pending });
        return publicPendingMutation(replacement);
      });
    },

    captureSupersessionBoundary(
      userId: string,
      habitId: string,
    ): Promise<HabitMutationSupersessionBoundary> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        return {
          userId,
          habitId,
          pendingFields: journal.pending
            .filter((operation) => operation.userId === userId && operation.habitId === habitId)
            .map((operation) => ({
              operationId: operation.id,
              fieldOrigins: { ...operation.fieldOrigins },
            })),
          failureIds: journal.failures
            .filter((failure) => failure.userId === userId && failure.habitId === habitId)
            .map((failure) => failure.id),
        };
      });
    },

    settleSuperseded(
      boundary: HabitMutationSupersessionBoundary,
      confirmedPayload: Record<string, unknown>,
      options: { resolveFailures?: boolean } = {},
    ): Promise<{
      pending: PendingHabitMutation[];
      failures: HabitMutationReconciliationFailure[];
    }> {
      if (
        boundary.pendingFields.length === 0 &&
        (!options.resolveFailures || boundary.failureIds.length === 0)
      ) {
        return Promise.resolve({ pending: [], failures: [] });
      }
      const confirmedKeys = new Set(Object.keys(confirmedPayload));
      const capturedOrigins = new Map<string, Set<string>>();
      for (const pending of boundary.pendingFields) {
        for (const [key, origin] of Object.entries(pending.fieldOrigins)) {
          const origins = capturedOrigins.get(key) ?? new Set<string>();
          origins.add(origin);
          capturedOrigins.set(key, origins);
        }
      }
      const failureIds = new Set(boundary.failureIds);
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const matchesScope = (item: { userId: string; habitId: string }) =>
          item.userId === boundary.userId && item.habitId === boundary.habitId;
        const pending: PendingHabitMutation[] = [];
        const nextPending = journal.pending.flatMap((operation) => {
          if (!matchesScope(operation)) return [operation];
          const payload: Record<string, unknown> = {};
          const fieldOrigins: Record<string, string> = {};
          let superseded = false;
          for (const [key, value] of Object.entries(operation.payload)) {
            const origin = operation.fieldOrigins[key] ?? operation.id;
            if (confirmedKeys.has(key) && capturedOrigins.get(key)?.has(origin)) {
              superseded = true;
              continue;
            }
            payload[key] = value;
            fieldOrigins[key] = origin;
          }
          if (!superseded) return [operation];
          pending.push(publicPendingMutation(operation));
          if (Object.keys(payload).length === 0) return [];
          return [
            {
              ...operation,
              kind: typeof payload.archived_at === "string" ? "archive" : "update",
              payload,
              fieldOrigins,
            } satisfies StoredPendingHabitMutation,
          ];
        });
        const failures = options.resolveFailures
          ? journal.failures.filter(
              (failure) => matchesScope(failure) && failureIds.has(failure.id),
            )
          : [];
        if (pending.length > 0 || failures.length > 0) {
          await writeJournalUnlocked({
            version: 1,
            pending: nextPending,
            failures: journal.failures.filter(
              (failure) =>
                !options.resolveFailures || !matchesScope(failure) || !failureIds.has(failure.id),
            ),
          });
        }
        return { pending, failures };
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
        return removed.map(publicPendingMutation);
      });
    },

    settleSucceeded(
      operationId: string,
      options: { resolveLegacyFailures?: boolean } = {},
    ): Promise<PendingHabitMutation | null> {
      return runExclusive(async () => {
        const journal = await readJournalUnlocked();
        const operation = journal.pending.find((item) => item.id === operationId) ?? null;
        if (!operation) return null;
        const succeededFields = new Set(Object.keys(operation.payload));
        const failures = journal.failures.flatMap((failure) => {
          const matchesScope =
            failure.userId === operation.userId && failure.habitId === operation.habitId;
          if (!matchesScope) return [failure];
          if (operation.kind === "archive") return [];
          if (failure.failedFields === null) {
            return options.resolveLegacyFailures ? [] : [failure];
          }
          const failedFields = failure.failedFields.filter((field) => !succeededFields.has(field));
          return failedFields.length > 0 ? [{ ...failure, failedFields }] : [];
        });
        await writeJournalUnlocked({
          version: 1,
          pending: journal.pending.filter((item) => item.id !== operationId),
          failures,
        });
        return publicPendingMutation(operation);
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
