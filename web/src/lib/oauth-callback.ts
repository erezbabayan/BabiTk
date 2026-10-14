export const OAUTH_CODE_GUARD_KEY = "mindtasker:oauth-code";

export type PkceExchangeResult = {
  error: { message: string } | null;
};

/**
 * Exchange a PKCE code once. Callers must turn off detectSessionInUrl so
 * supabase-js does not race this exchange and burn the one-time code.
 */
export async function completePkceSignIn(options: {
  code: string | null;
  hasSession: boolean;
  exchange: (code: string) => Promise<PkceExchangeResult>;
  readGuard?: () => string | null;
  writeGuard?: (code: string) => void;
}): Promise<{ exchanged: boolean; errorMessage: string | null }> {
  const code = options.code?.trim() || null;
  if (!code || options.hasSession) {
    return { exchanged: false, errorMessage: null };
  }

  let alreadyTried = false;
  try {
    alreadyTried = (options.readGuard?.() ?? null) === code;
    options.writeGuard?.(code);
  } catch {
    alreadyTried = false;
  }
  if (alreadyTried) {
    return { exchanged: false, errorMessage: null };
  }

  const { error } = await options.exchange(code);
  if (error?.message) {
    return { exchanged: false, errorMessage: error.message };
  }
  return { exchanged: true, errorMessage: null };
}

export function browserOAuthCodeGuard(): {
  readGuard: () => string | null;
  writeGuard: (code: string) => void;
} {
  return {
    readGuard: () => {
      try {
        return sessionStorage.getItem(OAUTH_CODE_GUARD_KEY);
      } catch {
        return null;
      }
    },
    writeGuard: (code: string) => {
      try {
        sessionStorage.setItem(OAUTH_CODE_GUARD_KEY, code);
      } catch {
        // ignore
      }
    },
  };
}
