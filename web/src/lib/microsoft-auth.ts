import type { SupabaseClient } from "@supabase/supabase-js";

import { applyRememberMePreference } from "./auth-storage";
import { formatOAuthSignInError } from "./auth-redirect";
import { supabaseAuthRedirectUrl } from "./supabase";

/** Sign in with Microsoft / Azure via Supabase OAuth. */
export async function signInWithMicrosoft(supabase: SupabaseClient): Promise<void> {
  applyRememberMePreference(true, "");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: supabaseAuthRedirectUrl(),
      scopes: "email openid profile",
    },
  });
  if (error) throw new Error(formatOAuthSignInError(error, null, "Microsoft"));
}
