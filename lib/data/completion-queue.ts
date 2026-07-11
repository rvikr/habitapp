// Offline queue for completion mutations. When logging a completion fails with
// a transport error, the operation is persisted here and replayed once
// connectivity returns, so a "done" tap in airplane mode is never lost. A
// transport error can arrive after the server commits, so increment_once carries
// a database operation UUID; legacy increment entries remain for compatibility.
// Replays run single-flight and in
// FIFO order; absolute writes (complete/uncomplete/set_value) for a habit+day
// supersede anything queued earlier for that same habit+day. Monotonic raises
// (set_value_max, from the step sync) supersede only earlier raises — queued
// manual increments carry user intent the sync must not erase.

import { supabase, getCurrentUser } from "../supabase/client";
import { buildCompletionValuePayload } from "./completions";
import { clearDataCache } from "./cache";
import { scheduleReminderSync } from "./reminder-sync";
import { reportError } from "../services/sentry";
import { recordCompletionQueueSettled } from "../services/activation-completion";
import { optimisticFirstLogStore } from "../services/activation-marker";
import { foreignCompletionOwnerIds } from "../activation/queue-marker-reconciliation";
import { completionQueueStore } from "../services/completion-queue-store";
import type { PendingCompletionInput, PendingCompletionOp } from "./completion-queue-store";

export type { PendingCompletionOp } from "./completion-queue-store";

// Matches the messages supabase-js surfaces when fetch itself rejects. This
// classifies queueable transport failures; it does not imply the server failed
// to commit, which is why non-absolute increments need a receipt-backed UUID.
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

export async function enqueueCompletionOp(op: PendingCompletionInput): Promise<void> {
  await completionQueueStore.enqueue({
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  });
}

export async function pendingCompletionCount(): Promise<number> {
  return (await completionQueueStore.read()).length;
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
  if ((await completionQueueStore.read()).length === 0) return;

  const user = await getCurrentUser().catch(() => null);
  if (!user) return;

  let replayed = 0;
  let settled = false;
  let networkBlocked = false;
  while (true) {
    const queue = await completionQueueStore.read();
    if (queue.length === 0) break;

    // Ops queued under a different account can never replay successfully
    // (RLS); remove their IDs against the latest queue instead of replacing a
    // concurrent enqueue with an older snapshot.
    const foreign = queue.filter((op) => op.userId !== user.id);
    if (foreign.length > 0) {
      const removed = await completionQueueStore.removeIds(foreign.map((op) => op.id));
      await Promise.all(
        foreignCompletionOwnerIds(removed, user.id).map((userId) =>
          optimisticFirstLogStore.clear(userId),
        ),
      );
      continue;
    }

    const op = queue[0];
    // Replay is intentionally outside the storage mutation lock. Once it
    // settles, remove only this operation from whatever queue exists then.
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
    await completionQueueStore.removeIds([op.id]);
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

  if (op.kind === "increment_once") {
    const { error } = await supabase.rpc("log_habit_completion_once", {
      p_operation_id: op.operationId,
      p_habit_id: op.habitId,
      p_completed_on: op.completedOn,
      p_increment: op.value ?? 1,
      p_note: op.note ?? null,
    });
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
