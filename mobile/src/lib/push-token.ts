import { isMissingSchemaError } from "./schema-compat";
import { requireSupabase } from "./supabase";

/** Keep in sync with supabase/functions/_shared/expo-push.ts isExpoPushToken. */
export function isExpoPushToken(token: string): boolean {
  if (!token.endsWith("]")) return false;
  return (
    (token.startsWith("ExponentPushToken[") && token.length > "ExponentPushToken[]".length) ||
    (token.startsWith("ExpoPushToken[") && token.length > "ExpoPushToken[]".length)
  );
}

/**
 * Store this device's Expo push token on the signed-in user's row.
 * RLS allows the insert only when user_id is auth.uid().
 */
export async function upsertOwnPushToken(params: {
  userId: string;
  token: string;
  platform: "ios" | "android" | "web";
}): Promise<void> {
  if (!isExpoPushToken(params.token)) {
    throw new Error("unexpected push token");
  }
  const { error } = await requireSupabase()
    .from("user_push_tokens")
    .upsert(
      {
        user_id: params.userId,
        token: params.token,
        platform: params.platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" },
    );
  if (error && !isMissingSchemaError(error)) throw error;
}
