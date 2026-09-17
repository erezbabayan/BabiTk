import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export async function insertUserNotification(params: {
  userId: string;
  title: string;
  body: string;
  itemId?: string | null;
}): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase.from("user_notifications").insert({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    item_id: params.itemId ?? null,
    fire_at: new Date().toISOString(),
  });
}

export async function listUserNotifications(userId: string, limit = 40) {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id, title, body, item_id, read, fire_at, created_at")
    .eq("user_id", userId)
    .order("fire_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("user_notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", userId);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("user_notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

export async function upsertPushToken(params: {
  userId: string;
  token: string;
  platform: "ios" | "android" | "web";
}): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase.from("user_push_tokens").upsert(
    {
      user_id: params.userId,
      token: params.token,
      platform: params.platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );
}

export async function sendExpoPushes(
  userId: string,
  title: string,
  body: string,
): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", userId);
  const tokens = (data ?? [])
    .map((row) => row.token)
    .filter((token) => typeof token === "string" && token.startsWith("ExponentPushToken"));
  if (tokens.length === 0) return 0;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title,
        body,
        sound: "default",
      })),
    ),
  });
  if (!response.ok) return 0;
  return tokens.length;
}
