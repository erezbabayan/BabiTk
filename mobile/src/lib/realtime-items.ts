import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "./supabase";

export const REALTIME_REFRESH_MS = 250;

export async function getSessionUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
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
