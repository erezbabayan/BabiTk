/** Production Pages origin + repo base path. */
export const GITHUB_PAGES_SITE_URL = "https://erezbabayan.github.io/BabiTk/";

const OAUTH_QUERY_KEYS = [
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
] as const;

export type OAuthCallback = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

/**
 * Build the URL Google/Supabase must return to after OAuth.
 * Always keep the app base path and a trailing slash so GitHub Pages
 * does not 301 `/BabiTk?code=` → `/BabiTk/` and drop the PKCE code.
 */
export function buildAuthRedirectUrl(
  origin: string,
  basePath = "/",
): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const withSlash = path.endsWith("/") ? path : `${path}/`;
  return new URL(withSlash, `${trimmedOrigin}/`).toString();
}

export function readOAuthCallback(
  search: string,
  hash = "",
): OAuthCallback {
  const fromSearch = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const hashQuery = hash.startsWith("#") ? hash.slice(1) : hash;
  const fromHash = new URLSearchParams(
    hashQuery.includes("=") ? hashQuery.replace(/^\/?/, "") : "",
  );
  const pick = (key: string): string | null => {
    const value = fromSearch.get(key) || fromHash.get(key);
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed : null;
  };
  return {
    code: pick("code"),
    error: pick("error") || pick("error_code"),
    errorDescription: pick("error_description"),
  };
}

export function stripOAuthParamsFromUrl(href: string): string {
  const url = new URL(href, "https://erezbabayan.github.io");
  for (const key of OAUTH_QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  if (url.hash.includes("=")) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    for (const key of OAUTH_QUERY_KEYS) {
      hashParams.delete(key);
    }
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isGoogleProviderEnabled(settings: {
  external?: { google?: boolean } | null;
} | null | undefined): boolean {
  return settings?.external?.google === true;
}

export function googleSignInOptions(redirectTo: string): {
  provider: "google";
  options: {
    redirectTo: string;
    scopes: string;
    queryParams: { prompt: string };
  };
} {
  return {
    provider: "google",
    options: {
      redirectTo,
      scopes: "email profile openid",
      queryParams: {
        prompt: "select_account",
      },
    },
  };
}

export function formatOAuthSignInError(
  error: unknown,
  description?: string | null,
  providerLabel = "Google",
): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const raw = [message, description ?? ""].join(" ").toLowerCase();

  if (
    raw.includes("provider is not enabled") ||
    raw.includes("unsupported provider")
  ) {
    return `התחברות ${providerLabel} עדיין לא הופעלה בשרת. צריך Client ID ו-Secret ב-Supabase.`;
  }
  if (raw.includes("access_denied") || raw.includes("user denied")) {
    return `ההתחברות עם ${providerLabel} בוטלה.`;
  }
  if (
    raw.includes("already registered") ||
    raw.includes("already been registered") ||
    raw.includes("identity is already") ||
    raw.includes("email already")
  ) {
    return `כבר יש חשבון עם האימייל הזה. היכנסו עם סיסמה, ואז אפשר לקשר ${providerLabel}.`;
  }
  if (
    raw.includes("bad_oauth_state") ||
    raw.includes("invalid flow") ||
    raw.includes("code verifier") ||
    raw.includes("pkce")
  ) {
    return `פג תוקף החיבור ל-${providerLabel}. נסו שוב מאותו חלון דפדפן, בלי לפתוח קישור במכשיר אחר.`;
  }
  if (raw.includes("redirect") && raw.includes("not allowed")) {
    return `כתובת החזרה מ-${providerLabel} לא מאושרת. בדקו את רשימת ה-Redirect ב-Supabase.`;
  }
  const readable = (description || message).trim();
  if (readable && readable.length < 180 && !readable.includes("{")) {
    return `התחברות ${providerLabel} נכשלה: ${readable}`;
  }
  return `התחברות ${providerLabel} נכשלה. נסו שוב.`;
}
