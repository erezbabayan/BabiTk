import type { SupabaseClient } from "@supabase/supabase-js";

/** Sign in with Google via Supabase OAuth. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  if (error) throw error;
}
