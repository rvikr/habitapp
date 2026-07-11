import { getCurrentUser, supabase } from "../supabase/client";
import { reportError } from "../services/sentry";
import { habitMutationQueueStore } from "../services/habit-mutation-queue-store";
import { clearDataCache } from "./cache";
import { isNetworkFailure } from "./completion-queue";
import { cancelHabitReminders, scheduleReminderSync } from "./reminder-sync";
import {
  reconcileHabitMutationQueue,
  type HabitMutationReconciliationFailure,
  type HabitMutationSupersessionBoundary,
  type PendingHabitMutation,
} from "./habit-mutation-queue-store";
import { runHabitMutationWriteExclusive } from "./habit-mutation-write-coordinator";

type PendingHabitMutationInput = Omit<PendingHabitMutation, "id" | "queuedAt">;

export async function enqueueHabitMutation(
  operation: PendingHabitMutationInput,
): Promise<PendingHabitMutation> {
  return habitMutationQueueStore.enqueue({
    ...operation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  });
}

export async function listPendingHabitMutations(userId: string): Promise<PendingHabitMutation[]> {
  return (await habitMutationQueueStore.read()).filter((operation) => operation.userId === userId);
}

export function replaceQueuedHabitMutationPayload(
  operationId: string,
  payload: Record<string, unknown>,
): Promise<PendingHabitMutation | null> {
  return habitMutationQueueStore.replacePayload(operationId, payload);
}

export function settleQueuedHabitMutation(
  operationId: string,
  options?: { resolveLegacyFailures?: boolean },
): Promise<PendingHabitMutation | null> {
  return habitMutationQueueStore.settleSucceeded(operationId, options);
}

export function rejectQueuedHabitMutation(
  operationId: string,
  input: { reason?: "rejected" | "not_found"; code?: string | null },
): Promise<HabitMutationReconciliationFailure | null> {
  return habitMutationQueueStore.settleRejected(operationId, {
    reason: input.reason ?? "rejected",
    code: input.code,
    failedAt: new Date().toISOString(),
  });
}

export function captureHabitMutationSupersession(
  userId: string,
  habitId: string,
): Promise<HabitMutationSupersessionBoundary> {
  return habitMutationQueueStore.captureSupersessionBoundary(userId, habitId);
}

export async function settleHabitMutationSupersession(
  boundary: HabitMutationSupersessionBoundary,
  confirmedPayload: Record<string, unknown>,
  options?: { resolveFailures?: boolean },
): Promise<void> {
  await habitMutationQueueStore.settleSuperseded(boundary, confirmedPayload, options);
}

let flushPromise: Promise<void> | null = null;

const RETRYABLE_DATABASE_CODES = new Set([
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
  "40001",
  "40P01",
  "55P03",
]);

export function isRetryableHabitMutationError(error: { message?: string; code?: string }): boolean {
  return isNetworkFailure(error) || (!!error.code && RETRYABLE_DATABASE_CODES.has(error.code));
}

export function flushPendingHabitMutations(): Promise<void> {
  if (!flushPromise) {
    flushPromise = runHabitMutationWriteExclusive(runFlush).finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

async function runFlush(): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;

  let result: Awaited<ReturnType<typeof reconcileHabitMutationQueue>>;
  try {
    result = await reconcileHabitMutationQueue({
      store: habitMutationQueueStore,
      userId: user.id,
      async send(operation) {
        try {
          const { data, error } = await supabase
            .from("habits")
            .update(operation.payload)
            .eq("id", operation.habitId)
            .eq("user_id", operation.userId)
            .select("id")
            .maybeSingle();

          if (error) {
            const retry = isRetryableHabitMutationError(error);
            if (!retry) {
              reportError(new Error(error.message ?? "Habit mutation replay rejected"), {
                context: "habit-mutation-queue",
                kind: operation.kind,
                code: error.code,
              });
            }
            return {
              ok: false as const,
              retry,
              reason: "rejected" as const,
              code: error.code,
            };
          }
          if (!data) {
            reportError(new Error("Queued habit no longer exists or is not writable"), {
              context: "habit-mutation-queue",
              kind: operation.kind,
              code: "not_found",
            });
            return {
              ok: false as const,
              retry: false,
              reason: "not_found" as const,
              code: null,
            };
          }
          return { ok: true as const };
        } catch {
          return { ok: false as const, retry: true };
        }
      },
    });
  } catch (error) {
    reportError(error instanceof Error ? error : new Error("Habit mutation journal failed"), {
      context: "habit-mutation-queue-store",
    });
    return;
  }

  for (const operation of result.succeeded) {
    if (operation.kind === "archive") {
      await cancelHabitReminders(operation.habitId).catch(() => undefined);
    }
  }
  if (result.succeeded.length > 0) {
    clearDataCache();
    scheduleReminderSync();
  }
}

export async function listHabitReconciliationFailures(
  habitId?: string,
): Promise<HabitMutationReconciliationFailure[]> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return [];
  return habitMutationQueueStore.readFailures(user.id, habitId);
}

export async function acknowledgeHabitReconciliationFailures(
  ids: readonly string[],
): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;
  await habitMutationQueueStore.acknowledgeFailures(user.id, ids);
}

export async function resolveHabitReconciliationFailures(habitId: string): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;
  const failures = await habitMutationQueueStore.readFailures(user.id, habitId);
  if (failures.length === 0) return;
  await habitMutationQueueStore.acknowledgeFailures(
    user.id,
    failures.map((failure) => failure.id),
  );
}
