// Offline queue for completion mutations. When logging a completion fails
// because the request never reached the server (offline, flaky network), the
// operation is persisted here and replayed once connectivity returns, so a
// "done" tap in airplane mode is never lost. Replays run single-flight and in
// FIFO order; absolute writes (complete/uncomplete/set_value) for a habit+day
// supersede anything queued earlier for that same habit+day. Monotonic raises
// (set_value_max, from the step sync) supersede only earlier raises — queued
// manual increments carry user intent the sync must not erase.

import { getItem, removeItem, setItem } from "../platform/storage";
import { supabase, getCurrentUser } from "../supabase/client";
import { buildCompletionValuePayload } from "./completions";
import { clearDataCache } from "./cache";
import { scheduleReminderSync } from "./reminder-sync";
import { reportError } from "../services/sentry";
import { recordCompletionQueueSettled } from "../services/activation-completion";
import { optimisticFirstLogStore } from "../services/activation-marker";
import { foreignCompletionOwnerIds } from "../activation/queue-marker-reconciliation";

const STORAGE_KEY = "habbit:pending-completions";
const MAX_QUEUE_LENGTH = 200;

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

// Matches the messages supabase-js surfaces when fetch itself rejects — i.e.
// the request never reached the server, so a replay cannot double-apply.
export function isNetworkFailure(error: { message?: string } | string | null | undefined): boolean {
  if (!error) return false;
  const message = (typeof error === "string" ? error : (error.message ?? "")).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network request failed") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("load failed")
  );
}

export async function enqueueCompletionOp(
  op: Omit<PendingCompletionOp, "id" | "queuedAt">,
): Promise<void> {
  const queue = await readQueue();
  const next = queue.filter((item) => {
    if (item.habitId !== op.habitId || item.completedOn !== op.completedOn) return true;
    if (op.kind === "increment") return true;
    if (op.kind === "set_value_max") return item.kind !== "set_value_max";
    return false;
  });
  next.push({
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  });
  await writeQueue(next.slice(-MAX_QUEUE_LENGTH));
}

export async function pendingCompletionCount(): Promise<number> {
  return (await readQueue()).length;
}

let flushPromise: Promise<void> | null = null;

// Replays queued ops. Stops at the first network failure (still offline) and
// keeps the remainder; drops ops the server rejects for any other reason.
export function flushPendingCompletions(): Promise<void> {
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

async function runFlush(): Promise<void> {
  let queue = await readQueue();
  if (queue.length === 0) return;

  const user = await getCurrentUser().catch(() => null);
  if (!user) return;

  // Ops queued under a different account can never replay successfully (RLS);
  // drop them instead of poisoning the queue.
  const foreign = queue.filter((op) => op.userId !== user.id);
  if (foreign.length > 0) {
    queue = queue.filter((op) => op.userId === user.id);
    await writeQueue(queue);
    await Promise.all(
      foreignCompletionOwnerIds(foreign, user.id).map((userId) =>
        optimisticFirstLogStore.clear(userId),
      ),
    );
  }

  let replayed = 0;
  let settled = false;
  let networkBlocked = false;
  while (queue.length > 0) {
    const op = queue[0];
    const error = await replayOp(op);

    if (error && isNetworkFailure(error)) {
      networkBlocked = true;
      break;
    }

    if (error) {
      reportError(new Error(error.message ?? "Completion replay rejected"), {
        context: "completion-queue",
        kind: op.kind,
        habitId: op.habitId,
        completedOn: op.completedOn,
      });
    } else {
      replayed += 1;
    }
    settled = true;
    queue = queue.slice(1);
    await writeQueue(queue);
  }

  if (replayed > 0) {
    clearDataCache();
    scheduleReminderSync();
  }
  if (settled && !networkBlocked) recordCompletionQueueSettled(user.id);
}

async function replayOp(op: PendingCompletionOp): Promise<{ message?: string } | null> {
  if (op.kind === "uncomplete") {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", op.habitId)
      .eq("user_id", op.userId)
      .eq("completed_on", op.completedOn);
    return error;
  }

  if (op.kind === "increment") {
    const { error } = await supabase.rpc("log_habit_completion", {
      p_habit_id: op.habitId,
      p_completed_on: op.completedOn,
      p_increment: op.value ?? 1,
      p_note: op.note ?? null,
    });
    return error;
  }

  if (op.kind === "set_value_max") {
    if (op.value == null) return null;
    const { error } = await supabase.rpc("raise_habit_completion_value", {
      p_habit_id: op.habitId,
      p_completed_on: op.completedOn,
      p_value: op.value,
      p_note: op.note ?? null,
    });
    return error;
  }

  let value = op.value;
  if (value == null) {
    const { data: habit, error: habitError } = await supabase
      .from("habits")
      .select("target")
      .eq("id", op.habitId)
      .eq("user_id", op.userId)
      .single();
    if (habitError) return habitError;
    const target = Number((habit as { target: number | null } | null)?.target ?? 1);
    value = target > 0 ? target : 1;
  }

  const { error } = await supabase
    .from("habit_completions")
    .upsert(
      buildCompletionValuePayload(
        op.habitId,
        op.userId,
        op.completedOn,
        value,
        op.note ?? undefined,
      ),
      { onConflict: "habit_id,completed_on" },
    );
  return error;
}

async function readQueue(): Promise<PendingCompletionOp[]> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingCompletionOp[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingCompletionOp[]): Promise<void> {
  if (queue.length === 0) await removeItem(STORAGE_KEY);
  else await setItem(STORAGE_KEY, JSON.stringify(queue));
}
