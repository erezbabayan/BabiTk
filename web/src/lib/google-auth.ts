import type { SupabaseClient } from "@supabase/supabase-js";

import { applyRememberMePreference } from "./auth-storage";
import {
  formatOAuthSignInError,
  GOOGLE_PROVIDER_DISABLED_MESSAGE,
  googleSignInOptions,
  isGoogleProviderEnabled,
} from "./auth-redirect";
import { getGoogleCalendarHealth } from "./google-calendar-client";
import { requestGoogleAuthorizationCode } from "./google-identity";
import { completeGoogleLoginWithCode } from "./google-login-client";
import { preferGoogleOAuthRedirect } from "./auth-account";
import { googleLoginReady, looksLikeGoogleClientId } from "./google-calendar-setup";
import { supabaseAuthRedirectUrl } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const GOOGLE_LOGIN_SETUP_MESSAGE = GOOGLE_PROVIDER_DISABLED_MESSAGE;

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

/**
 * Sign in with Google. Prefer the live Auth provider so every new user gets a
 * normal Google identity (Settings → Calendar is then a single «חבר»).
 * GIS popup is only a fallback when the provider is not enabled yet.
 */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  applyRememberMePreference(true, "");
  const health = await getGoogleCalendarHealth();
  if (preferGoogleOAuthRedirect(health)) {
    await signInWithGoogleOAuth(supabase);
    return;
  }
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
      throw new Error(formatOAuthSignInError(error));
    }
  }
  if (googleLoginReady(health)) {
    await signInWithGoogleOAuth(supabase);
    return;
  }
  throw new Error(GOOGLE_LOGIN_SETUP_MESSAGE);
}
