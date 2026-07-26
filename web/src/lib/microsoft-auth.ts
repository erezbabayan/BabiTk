import type { SupabaseClient } from "@supabase/supabase-js";

/** Sign in with Microsoft / Azure via Supabase OAuth. */
export async function signInWithMicrosoft(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: window.location.origin,
      scopes: "email openid profile",
    },
  });
  if (error) throw error;
}
