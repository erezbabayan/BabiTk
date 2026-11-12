import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const LAZY_RELOAD_AT_KEY = "babitk:lazy-chunk-reload-at";
const LAZY_RELOAD_MIN_GAP_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

/** One hard reload (at most every 30s) when a chunk from an older deploy is gone. */
export function shouldReloadForChunkError(
  error: unknown,
  lastReloadAt: number | null,
  now: number,
): boolean {
  if (!isChunkLoadError(error)) return false;
  return lastReloadAt === null || now - lastReloadAt > LAZY_RELOAD_MIN_GAP_MS;
}

function readLastReloadAt(): number | null {
  try {
    const raw = sessionStorage.getItem(LAZY_RELOAD_AT_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Memoized dynamic import, so prefetch and render share one request. */
export function chunkLoader<M>(load: () => Promise<M>): () => Promise<M> {
  let pending: Promise<M> | null = null;
  return () => {
    if (!pending) {
      pending = load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}

/**
 * React.lazy for a named export, with the same stale-deploy recovery as the root App chunk.
 */
export function lazyNamed<M, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K] extends ComponentType<infer P> ? ComponentType<P> : never> {
  type C = M[K] extends ComponentType<infer P> ? ComponentType<P> : never;
  return lazy(async () => {
    try {
      const mod = await load();
      return { default: mod[name] as unknown as C };
    } catch (error) {
      if (typeof window !== "undefined" && shouldReloadForChunkError(error, readLastReloadAt(), Date.now())) {
        try {
          sessionStorage.setItem(LAZY_RELOAD_AT_KEY, String(Date.now()));
        } catch {
          // ignore storage errors
        }
        window.location.reload();
        return new Promise<{ default: C }>(() => undefined);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  });
}
