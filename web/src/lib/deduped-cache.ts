/**
 * Short-lived, per-key cache with in-flight de-duplication.
 * Several hooks read the same user profile on boot; they now share one request.
 */
export interface DedupedCache<T> {
  get(key: string, load: () => Promise<T>, options?: { fresh?: boolean }): Promise<T>;
  invalidate(): void;
}

export function createDedupedCache<T>(
  ttlMs: number,
  now: () => number = () => Date.now(),
): DedupedCache<T> {
  let cached: { key: string; at: number; value: T } | null = null;
  let inflight: { key: string; promise: Promise<T> } | null = null;
  let generation = 0;

  return {
    async get(key, load, options = {}) {
      if (
        !options.fresh &&
        cached &&
        cached.key === key &&
        now() - cached.at < ttlMs
      ) {
        return cached.value;
      }
      if (inflight && inflight.key === key) return inflight.promise;

      const startedAt = generation;
      const promise = load();
      inflight = { key, promise };
      try {
        const value = await promise;
        // A write that happened while this read was in flight wins: do not cache.
        if (startedAt === generation) cached = { key, at: now(), value };
        return value;
      } finally {
        if (inflight?.promise === promise) inflight = null;
      }
    },
    invalidate() {
      generation += 1;
      cached = null;
      inflight = null;
    },
  };
}
