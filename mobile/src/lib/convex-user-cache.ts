import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Id } from "../../../convex/_generated/dataModel";

const STORAGE_PREFIX = "mindtasker:convex:user:";
const memoryCache = new Map<string, Id<"users">>();
const inFlight = new Map<string, Promise<Id<"users">>>();

export function readCachedConvexUserIdSync(
  legacyId: string,
): Id<"users"> | undefined {
  return memoryCache.get(legacyId);
}

export async function hydrateConvexUserCache(
  legacyId: string,
): Promise<Id<"users"> | undefined> {
  const cached = memoryCache.get(legacyId);
  if (cached) return cached;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_PREFIX + legacyId);
    if (!stored) return undefined;
    const userId = stored as Id<"users">;
    memoryCache.set(legacyId, userId);
    return userId;
  } catch {
    return undefined;
  }
}

async function writeCachedConvexUserId(
  legacyId: string,
  userId: Id<"users">,
): Promise<void> {
  memoryCache.set(legacyId, userId);
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + legacyId, userId);
  } catch {
    // ignore
  }
}

export function clearConvexUserCaches(): void {
  memoryCache.clear();
  inFlight.clear();
}

export async function clearAllConvexUserCaches(): Promise<void> {
  memoryCache.clear();
  inFlight.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(STORAGE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // ignore
  }
}

export function resolveConvexUserId(
  legacyId: string,
  run: () => Promise<{ userId: Id<"users"> }>,
): Promise<Id<"users">> {
  const cached = memoryCache.get(legacyId);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(legacyId);
  if (pending) return pending;

  const promise = (async () => {
    const hydrated = await hydrateConvexUserCache(legacyId);
    if (hydrated) return hydrated;

    const result = await run();
    await writeCachedConvexUserId(legacyId, result.userId);
    return result.userId;
  })().finally(() => {
    inFlight.delete(legacyId);
  });

  inFlight.set(legacyId, promise);
  return promise;
}
