import { activationCompletionEvents } from "../activation/events";
import { optimisticFirstLogStore } from "./activation-marker";

export async function recordPositiveCompletion(userId: string, queued: boolean): Promise<void> {
  try {
    await optimisticFirstLogStore.mark(userId);
  } catch {
    // The completion already reached the server or durable queue. Activation
    // bookkeeping is best effort and must never turn that success into a retry.
  }
  activationCompletionEvents.positiveCompletion(userId, queued);
}

export function recordCompletionQueueSettled(userId: string): void {
  activationCompletionEvents.queueSettled(userId);
}
