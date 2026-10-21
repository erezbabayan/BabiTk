const TTL_MS = 60_000;

const cache = new Map<string, { names: string[]; at: number }>();

export function publishAllowedTagNames(userId: string, names: string[]): void {
  if (!userId) return;
  cache.set(userId, {
    names: names.map((name) => name.trim()).filter(Boolean),
    at: Date.now(),
  });
}

/** Cached tag names. `fresh` is false after a minute so the caller can refresh in the background. */
export function peekAllowedTagNames(
  userId: string,
): { names: string[]; fresh: boolean } | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  return { names: entry.names, fresh: Date.now() - entry.at < TTL_MS };
}

export function resetAllowedTagNamesForTests(): void {
  cache.clear();
}
