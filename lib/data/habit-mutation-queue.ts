import { getCurrentUser, supabase } from "../supabase/client";
import { reportError } from "../services/sentry";
import { habitMutationQueueStore } from "../services/habit-mutation-queue-store";
import { clearDataCache } from "./cache";
import { isNetworkFailure } from "./completion-queue";
import { cancelHabitReminders, scheduleReminderSync } from "./reminder-sync";
import type { PendingHabitMutation } from "./habit-mutation-queue-store";

type PendingHabitMutationInput = Omit<PendingHabitMutation, "id" | "queuedAt">;

export async function enqueueHabitMutation(operation: PendingHabitMutationInput): Promise<void> {
  await habitMutationQueueStore.enqueue({
    ...operation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  });
}

let flushPromise: Promise<void> | null = null;

export function flushPendingHabitMutations(): Promise<void> {
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

async function runFlush(): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;

  let replayed = false;
  while (true) {
    const queue = await habitMutationQueueStore.read();
    if (queue.length === 0) break;

    const foreignIds = queue
      .filter((operation) => operation.userId !== user.id)
      .map((operation) => operation.id);
    if (foreignIds.length > 0) {
      await habitMutationQueueStore.removeIds(foreignIds);
      continue;
    }

    const operation = queue[0];
    const { error } = await supabase
      .from("habits")
      .update(operation.payload)
      .eq("id", operation.habitId)
      .eq("user_id", operation.userId);

    if (error && isNetworkFailure(error)) break;
    if (error) {
      reportError(new Error(error.message ?? "Habit mutation replay rejected"), {
        context: "habit-mutation-queue",
        kind: operation.kind,
      });
    } else {
      replayed = true;
      if (operation.kind === "archive") {
        await cancelHabitReminders(operation.habitId).catch(() => undefined);
      }
    }
    await habitMutationQueueStore.removeIds([operation.id]);
  }

  if (replayed) {
    clearDataCache();
    scheduleReminderSync();
  }
}
