/** Persist local/offline mode when the Convex cloud plan is disabled. */

export const FORCE_LOCAL_KEY = "babitk:force-local-mode";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readForcedLocalMode(): boolean {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(FORCE_LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeForcedLocalMode(enabled: boolean): void {
  if (!canUseStorage()) return;
  try {
    if (enabled) {
      window.localStorage.setItem(FORCE_LOCAL_KEY, "1");
    } else {
      window.localStorage.removeItem(FORCE_LOCAL_KEY);
    }
  } catch {
    // Private mode / quota — ignore; in-memory flag still applies via isDemoMode.
  }
}
