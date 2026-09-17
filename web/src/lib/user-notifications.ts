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

export async function insertUserNotification(params: {
  title: string;
  body: string;
  itemId?: string | null;
}): Promise<UserNotification | null> {
  if (isDemoMode || !isSupabaseConfigured) return null;
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("user_notifications")
    .insert({
      user_id: userId,
      title: params.title,
      body: params.body,
      item_id: params.itemId ?? null,
      fire_at: new Date().toISOString(),
    })
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
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

export const OPEN_ITEM_EVENT = "babitk:open-item";

export function requestOpenItem(itemId: string): void {
  if (!itemId || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_ITEM_EVENT, { detail: { itemId } }));
}

export function itemIdFromOpenEvent(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const itemId = (event.detail as { itemId?: unknown } | undefined)?.itemId;
  return typeof itemId === "string" && itemId ? itemId : null;
}

const locallyPresentedIds = new Set<string>();

export function rememberLocallyPresentedNotification(id: string): void {
  if (!id) return;
  locallyPresentedIds.add(id);
}

export function wasLocallyPresentedNotification(id: string): boolean {
  return locallyPresentedIds.has(id);
}
