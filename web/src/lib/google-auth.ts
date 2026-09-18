import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAuthRedirectUrl } from "./supabase";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Sign in with Google via Supabase OAuth. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: supabaseAuthRedirectUrl() || window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      scopes: `${GOOGLE_CALENDAR_SCOPE} email profile`,
    },
  });
  if (error) throw error;
}
