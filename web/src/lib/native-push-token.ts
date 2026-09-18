import { isMissingSchemaError } from "./schema-compat";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";

export async function saveNativePushToken(
  token: string,
  platform: "ios" | "android",
): Promise<void> {
  if (isDemoMode || !isSupabaseConfigured || token.trim().length < 8) return;
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from("user_push_tokens").upsert(
    {
      user_id: userId,
      token: token.trim(),
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );
  if (error && !isMissingSchemaError(error)) {
    console.warn("[push] failed to save token:", error.message);
  }
}
