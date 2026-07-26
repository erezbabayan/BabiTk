import type { Id } from "../../../convex/_generated/dataModel";

const STORAGE_PREFIX = "mindtasker:convex:user:";
const inFlight = new Map<string, Promise<Id<"users">>>();

export function readCachedConvexUserId(
  legacyId: string,
): Id<"users"> | undefined {
  try {
    const value = sessionStorage.getItem(STORAGE_PREFIX + legacyId);
    return value ? (value as Id<"users">) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedConvexUserId(
  legacyId: string,
  userId: Id<"users">,
): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + legacyId, userId);
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedConvexUserId(legacyId: string): void {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + legacyId);
  } catch {
    // ignore
  }
}

export function resolveConvexUserId(
  legacyId: string,
  run: () => Promise<{ userId: Id<"users"> }>,
): Promise<Id<"users">> {
  const cached = readCachedConvexUserId(legacyId);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(legacyId);
  if (pending) return pending;

  const promise = run()
    .then((result) => {
      writeCachedConvexUserId(legacyId, result.userId);
      return result.userId;
    })
    .finally(() => {
      inFlight.delete(legacyId);
    });

  inFlight.set(legacyId, promise);
  return promise;
}
