import {
  clearCachedAuthUserId,
  clearConvexAuthTokens,
  clearRememberedEmail,
  readRememberMe,
} from "./auth-storage";
import { DEMO_USER_ID } from "./demo-store";
import { clearCachedConvexUserId } from "./convex-user-cache";

const DEMO_USER_KEY = "mindtasker:demo:user";

/** Clear client-side user id caches so the next login cannot reuse another account. */
export function clearAuthSessionCaches(): void {
  try {
    clearCachedAuthUserId();
    sessionStorage.removeItem(DEMO_USER_KEY);
    clearCachedConvexUserId(DEMO_USER_ID);
    clearConvexAuthTokens();

    if (!readRememberMe()) {
      clearRememberedEmail();
    }

    const prefix = "mindtasker:convex:user:";
    for (const storage of [localStorage, sessionStorage]) {
      const keysToRemove: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    }
  } catch {
    // ignore private mode / quota errors
  }
}
