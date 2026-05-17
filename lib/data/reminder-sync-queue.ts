export function createQueuedReminderSync(sync: () => Promise<void>): () => Promise<void> {
  let tail = Promise.resolve();

  return function queuedReminderSync() {
    const run = tail.catch(() => undefined).then(sync);
    tail = run.catch(() => undefined);
    return run;
  };
}
