import type { SupabaseClient } from "@supabase/supabase-js";

import { applyRememberMePreference } from "./auth-storage";
import {
  formatOAuthSignInError,
  googleSignInOptions,
  isGoogleProviderEnabled,
} from "./auth-redirect";
import { supabaseAuthRedirectUrl } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

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

/** Sign in with Google via Supabase OAuth, returning to the app base path. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
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
