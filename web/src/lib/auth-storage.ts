import { convex } from "./convex";

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim() ?? "";

export const REMEMBER_ME_KEY = "mindtasker:auth:remember-me";
export const REMEMBER_EMAIL_KEY = "mindtasker:auth:remembered-email";
export const CONVEX_AUTH_USER_KEY = "mindtasker:convex:auth-session-user";

const CONVEX_AUTH_TOKEN_KEYS = [
  "__convexAuthOAuthVerifier",
  "__convexAuthJWT",
  "__convexAuthRefreshToken",
  "__convexAuthServerStateFetchTime",
] as const;

export interface TokenStorage {
  getItem: (key: string) => string | null | undefined | Promise<string | null | undefined>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

let rememberMePreference = readRememberMe();

function browserStorage(persistent: boolean): Storage | null {
  if (typeof window === "undefined") return null;
  return persistent ? window.localStorage : window.sessionStorage;
}

/** Whether the user wants to stay signed in after closing the browser. */
export function readRememberMe(): boolean {
  try {
    const value = localStorage.getItem(REMEMBER_ME_KEY);
    if (value === null) return true;
    return value === "1";
  } catch {
    return true;
  }
}

export function writeRememberMe(remember: boolean): void {
  rememberMePreference = remember;
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
  } catch {
    // ignore
  }
}

export function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeRememberedEmail(email: string): void {
  try {
    const trimmed = email.trim();
    if (trimmed) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, trimmed);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearRememberedEmail(): void {
  try {
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    // ignore
  }
}

function convexDeploymentNamespace(): string {
  const url =
    convexUrl ||
    (convex as { url?: string } | null)?.url ||
    (convex as { address?: string } | null)?.address ||
    "";
  return url.replace(/[^a-zA-Z0-9]/g, "");
}

function convexAuthStorageKeys(): string[] {
  const namespace = convexDeploymentNamespace();
  if (!namespace) return [];
  return CONVEX_AUTH_TOKEN_KEYS.map((key) => `${key}_${namespace}`);
}

/** Remove Convex Auth tokens from both browser storages. */
export function clearConvexAuthTokens(): void {
  for (const key of convexAuthStorageKeys()) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/**
 * Convex Auth token storage — localStorage when "remember me" is on,
 * sessionStorage when off (session ends when the browser closes).
 */
export const mutableAuthTokenStorage: TokenStorage = {
  getItem(key: string) {
    const primary = browserStorage(rememberMePreference);
    const secondary = browserStorage(!rememberMePreference);
    if (!primary) return null;
    const value = primary.getItem(key);
    if (value !== null) return value;
    return secondary?.getItem(key) ?? null;
  },
  setItem(key: string, value: string) {
    const primary = browserStorage(rememberMePreference);
    const secondary = browserStorage(!rememberMePreference);
    primary?.setItem(key, value);
    secondary?.removeItem(key);
  },
  removeItem(key: string) {
    browserStorage(true)?.removeItem(key);
    browserStorage(false)?.removeItem(key);
  },
};

/** Apply remember-me choice before sign-in. */
export function applyRememberMePreference(remember: boolean, email: string): void {
  writeRememberMe(remember);
  if (!remember) {
    clearConvexAuthTokens();
    clearRememberedEmail();
  } else if (email.trim()) {
    writeRememberedEmail(email.trim().toLowerCase());
  }
}

/** Persist login details after a successful sign-in. */
export function persistLoginDetails(remember: boolean, email: string): void {
  writeRememberMe(remember);
  const normalized = email.trim().toLowerCase();
  if (remember && normalized) {
    writeRememberedEmail(normalized);
  } else if (!remember) {
    clearRememberedEmail();
  }
}

function authUserIdStorage(): Storage | null {
  return browserStorage(rememberMePreference);
}

export function readCachedAuthUserId(): string | null {
  try {
    const primary = authUserIdStorage();
    const fallback = browserStorage(!rememberMePreference);
    return primary?.getItem(CONVEX_AUTH_USER_KEY) ?? fallback?.getItem(CONVEX_AUTH_USER_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeCachedAuthUserId(userId: string): void {
  try {
    const primary = authUserIdStorage();
    const secondary = browserStorage(!rememberMePreference);
    primary?.setItem(CONVEX_AUTH_USER_KEY, userId);
    secondary?.removeItem(CONVEX_AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

export function clearCachedAuthUserId(): void {
  try {
    localStorage.removeItem(CONVEX_AUTH_USER_KEY);
    sessionStorage.removeItem(CONVEX_AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

/** Supabase auth session storage (same remember-me behavior). */
export function getSupabaseAuthStorage(): TokenStorage {
  return mutableAuthTokenStorage;
}
