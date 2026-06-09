// Minimal dependency-free concurrency limiter. `createLimiter(max)` returns a
// `run` function that executes at most `max` tasks at once; further tasks queue
// and start as in-flight ones settle. Used to serialize background AI calls so a
// fan-out (e.g. one coach-message per habit during a reminder sync) cannot burst
// the upstream Gemini rate limit.
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  const queue: (() => void)[] = [];

  const startNext = () => {
    if (active >= limit) return;
    queue.shift()?.();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            startNext();
          });
      };
      if (active < limit) start();
      else queue.push(start);
    });
  };
}
