import * as QueryParams from "expo-auth-session/build/QueryParams";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

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

/** Sign in with Google via Supabase OAuth (opens system browser). */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  const redirectTo = makeRedirectUri({ scheme: "mindtasker" });

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

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

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
