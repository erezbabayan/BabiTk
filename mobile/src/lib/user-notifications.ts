import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";

export type UserNotification = {
  id: string;
  title: string;
  body: string;
  item_id: string | null;
  read: boolean;
  fire_at: string;
  created_at: string;
};

const SELECT = "id, title, body, item_id, read, fire_at, created_at";

function mapRow(row: Record<string, unknown>): UserNotification {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    item_id: typeof row.item_id === "string" ? row.item_id : null,
    read: row.read === true,
    fire_at: typeof row.fire_at === "string" ? row.fire_at : new Date().toISOString(),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

export async function listUserNotifications(limit = 40): Promise<UserNotification[]> {
  if (isDemoMode || !isSupabaseConfigured) return [];
  const { data, error } = await requireSupabase()
    .from("user_notifications")
    .select(SELECT)
    .order("fire_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function unreadNotificationCount(): Promise<number> {
  if (isDemoMode || !isSupabaseConfigured) return 0;
  const { count, error } = await requireSupabase()
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode || !isSupabaseConfigured || !id) return;
  const { error } = await requireSupabase()
    .from("user_notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  if (isDemoMode || !isSupabaseConfigured) return;
  const { error } = await requireSupabase()
    .from("user_notifications")
    .update({ read: true })
    .eq("read", false);
  if (error) throw error;
}

export function subscribeUserNotifications(
  userId: string,
  onChange: () => void,
): () => void {
  if (!isSupabaseConfigured || !userId) return () => {};
  const channel = requireSupabase()
    .channel(`user-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onChange();
      },
    )
    .subscribe();
  return () => {
    void requireSupabase().removeChannel(channel);
  };
}
