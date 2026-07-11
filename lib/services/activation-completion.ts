import { activationCompletionEvents } from "../activation/events";
import { optimisticFirstLogStore } from "./activation-marker";

export async function recordPositiveCompletion(userId: string, queued: boolean): Promise<void> {
  await optimisticFirstLogStore.mark(userId);
  activationCompletionEvents.positiveCompletion(userId, queued);
}

export function recordCompletionQueueSettled(userId: string): void {
  activationCompletionEvents.queueSettled(userId);
}
