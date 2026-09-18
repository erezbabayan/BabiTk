import * as QueryParams from "expo-auth-session/build/QueryParams";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

export type GoogleAuthSession = {
  accessToken: string;
  refreshToken: string;
};

/** Sign in with Google via Supabase OAuth (opens system browser). */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<GoogleAuthSession> {
  const redirectTo = makeRedirectUri({ scheme: "mindtasker" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("No OAuth URL returned");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === "cancel") {
    throw new Error("ההתחברות בוטלה");
  }

  if (result.type !== "success") {
    throw new Error("ההתחברות נכשלה");
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const refreshToken = sessionData.session?.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new Error("חסר session אחרי התחברות Google");
    }
    return { accessToken, refreshToken };
  }

  throw new Error("חסר קוד אימות מהתחברות Google");
}
