import type { SupabaseClient } from "@supabase/supabase-js";

import { isNativeApp, requestNativeGoogleOAuth } from "./native-bridge";
import { supabaseAuthRedirectUrl } from "./supabase";

/** Sign in with Google via Supabase OAuth. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  if (isNativeApp()) {
    const session = await requestNativeGoogleOAuth();
    const { error } = await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: supabaseAuthRedirectUrl() || window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  if (error) throw error;
}
