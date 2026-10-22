import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform, type AppStateStatus } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

/** Exact redirect. A bare `mindtasker:///` loses the auth code on Android. */
export const GOOGLE_REDIRECT_URL = "mindtasker://auth-callback";

function formatGoogleError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return "התחברות Google עדיין לא הופעלה בשרת. צריך Client ID ו-Secret ב-Supabase.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered") || lower.includes("email already")) {
    return "כבר יש חשבון עם האימייל הזה. היכנסו עם סיסמה, ואז אפשר לקשר Google.";
  }
  if (lower.includes("code verifier") || lower.includes("pkce") || lower.includes("bad_oauth_state")) {
    return "פג תוקף החיבור ל-Google. נסו שוב מאותו אפליקציה.";
  }
  if (raw && raw.length < 180 && !raw.includes("{")) {
    return `התחברות Google נכשלה: ${raw}`;
  }
  return "התחברות Google נכשלה. נסו שוב.";
}

type BrowserResult =
  | { type: "success"; url: string }
  | { type: "cancel" }
  | { type: "dismiss" };

/**
 * Android's expo-web-browser polyfill resolves `{ type: "dismiss" }` as soon as
 * the activity is active again, and that result beats the deep link. Listen for
 * the redirect ourselves, and ignore a brief background flicker when the tab opens.
 */
async function openGoogleBrowser(startUrl: string, redirectTo: string): Promise<BrowserResult> {
  if (Platform.OS !== "android") {
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectTo);
    if (result.type === "success") return { type: "success", url: result.url };
    if (result.type === "cancel") return { type: "cancel" };
    return { type: "dismiss" };
  }

  return await new Promise<BrowserResult>((resolve) => {
    let done = false;
    let backgroundSince = 0;
    let urlSub: { remove: () => void } | null = null;
    let appSub: { remove: () => void } | null = null;

    const finish = (value: BrowserResult) => {
      if (done) return;
      done = true;
      urlSub?.remove();
      appSub?.remove();
      resolve(value);
    };

    urlSub = Linking.addEventListener("url", (event) => {
      if (event.url.startsWith(redirectTo)) {
        finish({ type: "success", url: event.url });
      }
    });

    const onAppState = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        if (!backgroundSince) backgroundSince = Date.now();
        return;
      }
      if (state !== "active" || !backgroundSince) return;
      const awayMs = Date.now() - backgroundSince;
      if (awayMs < 500) {
        backgroundSince = 0;
        return;
      }
      setTimeout(() => {
        if (!done) finish({ type: "cancel" });
      }, 800);
    };
    appSub = AppState.addEventListener("change", onAppState);

    void WebBrowser.openBrowserAsync(startUrl).catch(() => {
      finish({ type: "dismiss" });
    });
  }).finally(() => {
    try {
      WebBrowser.dismissBrowser();
    } catch {
      // The custom tab is already closed.
    }
  });
}

/** Sign in with Google via Supabase OAuth (opens system browser). */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  const redirectTo = GOOGLE_REDIRECT_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: "email profile openid",
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) throw new Error(formatGoogleError(error));
  if (!data.url) throw new Error("לא התקבלה כתובת התחברות מ-Google");

  const result = await openGoogleBrowser(data.url, redirectTo);

  if (result.type === "cancel") {
    throw new Error("ההתחברות עם Google בוטלה.");
  }

  if (result.type !== "success") {
    throw new Error("התחברות Google נכשלה. נסו שוב.");
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(formatGoogleError(errorCode));

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw new Error(formatGoogleError(exchangeError));
    return;
  }

  throw new Error("חסר קוד אימות מהתחברות Google");
}
