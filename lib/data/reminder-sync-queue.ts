export function createQueuedReminderSync(sync: () => Promise<void>): () => Promise<void> {
  let activePromise: Promise<void> | null = null;
  let trailingRequested = false;
  let trailingPromise: Promise<void> | null = null;
  let resolveTrailing: (() => void) | null = null;
  let rejectTrailing: ((error: unknown) => void) | null = null;

  return function queuedReminderSync() {
    if (!activePromise) {
      activePromise = runSyncLoop();
      return activePromise;
    }

    trailingRequested = true;
    if (!trailingPromise) {
      trailingPromise = new Promise<void>((resolve, reject) => {
        resolveTrailing = resolve;
        rejectTrailing = reject;
      });
    }
    return trailingPromise;
  };

  async function runSyncLoop(): Promise<void> {
    let activeError: unknown;
    try {
      await sync();
    } catch (error) {
      activeError = error;
    }

    while (trailingRequested) {
      trailingRequested = false;
      const resolve = resolveTrailing;
      const reject = rejectTrailing;
      trailingPromise = null;
      resolveTrailing = null;
      rejectTrailing = null;

      try {
        await sync();
        resolve?.();
      } catch (error) {
        reject?.(error);
      }
    }

    activePromise = null;
    if (activeError) throw activeError;
  }
}
