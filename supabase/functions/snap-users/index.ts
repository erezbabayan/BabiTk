import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { handleSnapUsers, snapJson, type SnapUsersStore } from "../_shared/snap-users.ts";

// Auth is a dedicated server key (SNAP_REGISTRY_KEY), never Google tokens.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SNAP_REGISTRY_KEY = Deno.env.get("SNAP_REGISTRY_KEY") ?? "";

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return snapJson({ ok: false, error: "missing server configuration" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store: SnapUsersStore = {
    async find(email, installId) {
      const { data, error } = await supabase
        .from("snap_users")
        .select("email, install_id, status, sources")
        .eq("email", email)
        .eq("install_id", installId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async upsert(row) {
      const { error } = await supabase
        .from("snap_users")
        .upsert({ ...row, updated_at: row.last_seen }, { onConflict: "email,install_id" });
      if (error) throw new Error(error.message);
    },
  };
  try {
    return await handleSnapUsers(req, { key: SNAP_REGISTRY_KEY, store });
  } catch (err) {
    console.error("snap-users error", err instanceof Error ? err.message : err);
    return snapJson({ ok: false, error: "server error" }, 500);
  }
});
