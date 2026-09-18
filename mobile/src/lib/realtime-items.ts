import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "./supabase";

export const REALTIME_REFRESH_MS = 250;

export async function getSessionUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export type RealtimeChangePayload = {
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

function definedFields(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export function applyItemRealtimeChange<T extends { id: string; deleted_at?: string | null }>(
  prev: T[],
  payload: RealtimeChangePayload,
): T[] {
  const event = (payload.eventType ?? "").toUpperCase();
  const incoming = definedFields(payload.new);
  const outgoing = definedFields(payload.old);
  const id = String(incoming.id ?? outgoing.id ?? "");
  if (!id) return prev;

  const deletedAt = incoming.deleted_at;
  if (event === "DELETE" || (typeof deletedAt === "string" && deletedAt)) {
    return prev.filter((item) => item.id !== id);
  }

  const index = prev.findIndex((item) => item.id === id);
  if (index === -1) {
    return [{ ...(incoming as T), id }, ...prev];
  }

  const existing = prev[index] as T & { source_materials?: unknown };
  const merged = {
    ...existing,
    ...incoming,
    id,
  } as T & { source_materials?: unknown };
  if (merged.source_materials == null && existing.source_materials != null) {
    merged.source_materials = existing.source_materials;
  }
  const next = prev.slice();
  next[index] = merged;
  return next;
}

export function subscribeUserItems(
  client: SupabaseClient,
  userId: string,
  channelName: string,
  onChange: () => void,
): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      onChange();
    }, REALTIME_REFRESH_MS);
  };
  const channel = client
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mindtasker_items",
        filter: `user_id=eq.${userId}`,
      },
      schedule,
    )
    .subscribe();
  return () => {
    if (debounce) clearTimeout(debounce);
    void client.removeChannel(channel);
  };
}
