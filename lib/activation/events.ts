export type ActivationCompletionEvent =
  | { type: "positive_completion"; userId: string; queued: boolean }
  | { type: "completion_queue_settled"; userId: string };

type Listener = (event: ActivationCompletionEvent) => void;

export function createActivationCompletionEventBus() {
  const listeners = new Set<Listener>();

  function emit(event: ActivationCompletionEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Observability must not affect completion writes or queue replay.
      }
    }
  }

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    positiveCompletion(userId: string, queued: boolean): void {
      emit({ type: "positive_completion", userId, queued });
    },
    queueSettled(userId: string): void {
      emit({ type: "completion_queue_settled", userId });
    },
  };
}

export const activationCompletionEvents = createActivationCompletionEventBus();
