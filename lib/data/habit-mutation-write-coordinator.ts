export type HabitMutationWriteCoordinator = <T>(write: () => Promise<T>) => Promise<T>;

/**
 * Serialize habit writes that can target the same server rows.
 *
 * The offline journal has its own storage lock, but that lock deliberately does
 * not cover network requests. Replay and direct writes share this coordinator
 * so an older request cannot commit after a newer confirmed write.
 */
export function createHabitMutationWriteCoordinator(): HabitMutationWriteCoordinator {
  let tail = Promise.resolve();

  return async function runExclusive<T>(write: () => Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await write();
    } finally {
      release();
    }
  };
}

export const runHabitMutationWriteExclusive = createHabitMutationWriteCoordinator();
