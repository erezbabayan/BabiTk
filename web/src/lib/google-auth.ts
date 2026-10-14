import type { SupabaseClient } from "@supabase/supabase-js";

import { applyRememberMePreference } from "./auth-storage";
import {
  formatOAuthSignInError,
  googleSignInOptions,
  isGoogleProviderEnabled,
} from "./auth-redirect";
import { getGoogleCalendarHealth } from "./google-calendar-client";
import { requestGoogleAuthorizationCode } from "./google-identity";
import { completeGoogleLoginWithCode } from "./google-login-client";
import { googleLoginReady, looksLikeGoogleClientId } from "./google-calendar-setup";
import { supabaseAuthRedirectUrl } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const GOOGLE_LOGIN_SETUP_MESSAGE =
  "כניסת Google עדיין לא הופעלה. צרו לקוח Web ב-Google Cloud, היכנסו עם סיסמה, והדביקו Client ID ו-Secret בטופס שמתחת לכפתור.";

async function assertGoogleProviderEnabled(): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const disabledMessage = formatOAuthSignInError(
    "Unsupported provider: provider is not enabled",
  );
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    if (!response.ok) return;
    const settings: unknown = await response.json();
    const enabled =
      typeof settings === "object" &&
      settings !== null &&
      isGoogleProviderEnabled(settings as { external?: { google?: boolean } });
    if (!enabled) {
      throw new Error(disabledMessage);
    }
  } catch (error) {
    if (error instanceof Error && error.message === disabledMessage) {
      throw error;
    }
  }
}

async function signInWithGoogleOAuth(supabase: SupabaseClient): Promise<void> {
  applyRememberMePreference(true, "");
  await assertGoogleProviderEnabled();
  const spec = googleSignInOptions(supabaseAuthRedirectUrl());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: spec.provider,
    options: {
      ...spec.options,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw new Error(formatOAuthSignInError(error));
  if (!data.url) {
    throw new Error(formatOAuthSignInError("No OAuth URL returned"));
  }
  window.location.assign(data.url);
}

/** Sign in with Google. Prefers GIS popup + Edge session so existing users are linked. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  applyRememberMePreference(true, "");
  const health = await getGoogleCalendarHealth();
  const clientId = health.googleClientId ?? "";
  if (looksLikeGoogleClientId(clientId)) {
    try {
      const code = await requestGoogleAuthorizationCode(clientId);
      await completeGoogleLoginWithCode(code);
      return;
    } catch (error) {
      if (error instanceof Error && /access_denied|popup_closed/i.test(error.message)) {
        throw new Error(formatOAuthSignInError("access_denied"));
      }
      if (health.authProviderEnabled) {
        await signInWithGoogleOAuth(supabase);
        return;
      }
      throw new Error(formatOAuthSignInError(error));
    }
  }
  if (health.authProviderEnabled || googleLoginReady(health)) {
    await signInWithGoogleOAuth(supabase);
    return;
  }
  throw new Error(GOOGLE_LOGIN_SETUP_MESSAGE);
}
