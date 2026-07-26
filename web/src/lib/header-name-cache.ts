import type { UserNameParts } from "./user-display-name";

const LEGACY_KEY = "mindtasker:header:name";

function storageKey(userId?: string | null): string {
  if (userId) return `mindtasker:header:name:${userId}`;
  return LEGACY_KEY;
}

function readFromStorage(storage: Storage, key: string): UserNameParts | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserNameParts;
    if (!parsed.firstName?.trim() && !parsed.lastName?.trim()) return null;
    return {
      firstName: parsed.firstName?.trim() ?? "",
      lastName: parsed.lastName?.trim() ?? "",
    };
  } catch {
    return null;
  }
}

export function readCachedHeaderName(userId?: string | null): UserNameParts | null {
  if (userId) {
    const scoped =
      readFromStorage(localStorage, storageKey(userId)) ??
      readFromStorage(sessionStorage, storageKey(userId));
    if (scoped) return scoped;
  }
  return (
    readFromStorage(localStorage, LEGACY_KEY) ?? readFromStorage(sessionStorage, LEGACY_KEY)
  );
}

export function writeCachedHeaderName(parts: UserNameParts, userId?: string | null): void {
  const payload = JSON.stringify({
    firstName: parts.firstName.trim(),
    lastName: parts.lastName.trim(),
  });
  localStorage.setItem(LEGACY_KEY, payload);
  sessionStorage.setItem(LEGACY_KEY, payload);
  if (userId) {
    const key = storageKey(userId);
    localStorage.setItem(key, payload);
    sessionStorage.setItem(key, payload);
  }
}

export function clearCachedHeaderName(userId?: string | null): void {
  const keys = new Set<string>([LEGACY_KEY]);
  if (userId) keys.add(storageKey(userId));
  for (const key of keys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
