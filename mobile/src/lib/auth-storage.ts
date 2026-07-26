import AsyncStorage from "@react-native-async-storage/async-storage";

const REMEMBER_ME_KEY = "mindtasker:auth:remember-me";
const REMEMBER_EMAIL_KEY = "mindtasker:auth:remembered-email";
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

let rememberMePreference = true;

async function readRememberMePreference(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    if (value === null) return true;
    return value === "1";
  } catch {
    return true;
  }
}

void readRememberMePreference().then((value) => {
  rememberMePreference = value;
});

function convexAuthStorageKeys(): string[] {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? "";
  if (!convexUrl) return [];
  const namespace = convexUrl.replace(/[^a-zA-Z0-9]/g, "");
  return CONVEX_AUTH_TOKEN_KEYS.map((key) => `${key}_${namespace}`);
}

export async function writeConvexAuthTokens(
  token: string,
  refreshToken: string,
): Promise<void> {
  const keys = convexAuthStorageKeys();
  const jwtKey = keys.find((key) => key.includes("__convexAuthJWT"));
  const refreshKey = keys.find((key) => key.includes("__convexAuthRefreshToken"));
  if (!jwtKey || !refreshKey) return;

  try {
    await AsyncStorage.multiSet([
      [jwtKey, token],
      [refreshKey, refreshToken],
    ]);
  } catch {
    // ignore
  }
}

export async function clearConvexAuthTokens(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(convexAuthStorageKeys());
  } catch {
    // ignore
  }
}

export async function readConvexAuthJwt(): Promise<string | null> {
  const keys = convexAuthStorageKeys();
  const jwtKey = keys.find((key) => key.includes("__convexAuthJWT"));
  if (!jwtKey) return null;
  try {
    return (await AsyncStorage.getItem(jwtKey)) ?? null;
  } catch {
    return null;
  }
}

export const mutableAuthTokenStorage: TokenStorage = {
  async getItem(key: string) {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
  },
};

export async function readCachedAuthUserId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(CONVEX_AUTH_USER_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function writeCachedAuthUserId(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CONVEX_AUTH_USER_KEY, userId);
  } catch {
    // ignore
  }
}

export async function clearCachedAuthUserId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONVEX_AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

export async function readRememberMe(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    if (value === null) return true;
    return value === "1";
  } catch {
    return true;
  }
}

export async function writeRememberMe(remember: boolean): Promise<void> {
  rememberMePreference = remember;
  try {
    await AsyncStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
  } catch {
    // ignore
  }
}

export async function readRememberedEmail(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(REMEMBER_EMAIL_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function writeRememberedEmail(email: string): Promise<void> {
  try {
    const trimmed = email.trim();
    if (trimmed) {
      await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, trimmed);
    } else {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  } catch {
    // ignore
  }
}

export async function applyRememberMePreference(
  remember: boolean,
  email: string,
): Promise<void> {
  await writeRememberMe(remember);
  if (!remember) {
    await clearConvexAuthTokens();
    try {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {
      // ignore
    }
  } else if (email.trim()) {
    await writeRememberedEmail(email.trim().toLowerCase());
  }
}

export async function persistLoginDetails(
  remember: boolean,
  email: string,
): Promise<void> {
  await writeRememberMe(remember);
  const normalized = email.trim().toLowerCase();
  if (remember && normalized) {
    await writeRememberedEmail(normalized);
  } else if (!remember) {
    try {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {
      // ignore
    }
  }
}
