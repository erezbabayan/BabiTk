import type { SupabaseClient } from "@supabase/supabase-js";

import { applyRememberMePreference } from "./auth-storage";
import { formatOAuthSignInError, googleSignInOptions } from "./auth-redirect";
import { supabaseAuthRedirectUrl } from "./supabase";

/** Sign in with Google via Supabase OAuth, returning to the app base path. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  applyRememberMePreference(true, "");
  const redirectTo = supabaseAuthRedirectUrl();
  const { error } = await supabase.auth.signInWithOAuth(
    googleSignInOptions(redirectTo),
  );
  if (error) throw new Error(formatOAuthSignInError(error));
}
