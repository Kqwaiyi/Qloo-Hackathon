// Like the Stylist, it imports nothing, so the Workflow's sandbox can load it.

/**
 * Runs each task once fewer than `limit` are running, in the order they came. It only chains
 * promises, so a Workflow replays it the same way every time.
 */
export function atMost(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running < limit) running += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // The slot passes straight to the next task waiting, if there is one.
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}
