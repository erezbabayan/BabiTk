import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  createMemorySnapRateLimiter,
  handleSnapUsers,
  snapJson,
  type SnapAdminRow,
  type SnapStatus,
  type SnapUsersStore,
} from "../_shared/snap-users.ts";

// BabiSnap is machine-to-machine: verify_jwt stays false, and this handler checks
// a dedicated Bearer key. Never Google tokens and never the service-role key.
//
// SNAP_REGISTRY_CLIENT_KEY — signin, heartbeat, disconnect, GET status (the APK key).
// SNAP_REGISTRY_ADMIN_KEY — block, unblock, list. Do not ship this in the APK.
// SNAP_REGISTRY_KEY — temporary client-only fallback until BabiSnap rotates off it.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SNAP_REGISTRY_CLIENT_KEY = Deno.env.get("SNAP_REGISTRY_CLIENT_KEY") ?? "";
const SNAP_REGISTRY_ADMIN_KEY = Deno.env.get("SNAP_REGISTRY_ADMIN_KEY") ?? "";
const SNAP_REGISTRY_LEGACY_KEY = Deno.env.get("SNAP_REGISTRY_KEY") ?? "";

const limiter = createMemorySnapRateLimiter();

function asStatus(value: unknown): SnapStatus {
  if (value === "active" || value === "blocked" || value === "disconnected") return value;
  return "disconnected";
}

function asAdminRow(row: {
  email: string;
  install_id: string;
  status: unknown;
  sources: unknown;
  last_seen: string | null;
  app_version: string | null;
  device_label: string | null;
}): SnapAdminRow {
  return {
    email: row.email,
    install_id: row.install_id,
    status: asStatus(row.status),
    sources: Array.isArray(row.sources) ? row.sources.filter((s): s is string => typeof s === "string") : [],
    last_seen: row.last_seen,
    app_version: row.app_version,
    device_label: row.device_label,
  };
}

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
      if (!data) return null;
      return {
        email: data.email,
        install_id: data.install_id,
        status: asStatus(data.status),
        sources: Array.isArray(data.sources) ? data.sources.filter((s): s is string => typeof s === "string") : [],
      };
    },
    async upsert(row) {
      const { error } = await supabase
        .from("snap_users")
        .upsert({ ...row, updated_at: row.last_seen }, { onConflict: "email,install_id" });
      if (error) throw new Error(error.message);
    },
    async list(opts) {
      let query = supabase
        .from("snap_users")
        .select("email, install_id, status, sources, last_seen, app_version, device_label")
        .order("last_seen", { ascending: false })
        .limit(opts.limit);
      if (opts.email) query = query.eq("email", opts.email);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => asAdminRow(row));
    },
    async setStatus(email, installId, status, nowIso) {
      if (installId) {
        const { data: existing, error: findError } = await supabase
          .from("snap_users")
          .select("email")
          .eq("email", email)
          .eq("install_id", installId)
          .maybeSingle();
        if (findError) throw new Error(findError.message);
        if (existing) {
          const { error } = await supabase
            .from("snap_users")
            .update({ status, updated_at: nowIso })
            .eq("email", email)
            .eq("install_id", installId);
          if (error) throw new Error(error.message);
          return 1;
        }
        if (status !== "blocked") return 0;
        const { error } = await supabase.from("snap_users").insert({
          email,
          install_id: installId,
          status: "blocked",
          sources: [],
          last_seen: nowIso,
          updated_at: nowIso,
        });
        if (error) throw new Error(error.message);
        return 1;
      }
      const { data, error } = await supabase
        .from("snap_users")
        .update({ status, updated_at: nowIso })
        .eq("email", email)
        .select("email");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },
  };
  try {
    return await handleSnapUsers(req, {
      clientKey: SNAP_REGISTRY_CLIENT_KEY,
      adminKey: SNAP_REGISTRY_ADMIN_KEY,
      legacyKey: SNAP_REGISTRY_LEGACY_KEY,
      store,
      limiter,
    });
  } catch (err) {
    console.error("snap-users error", err instanceof Error ? err.message : err);
    return snapJson({ ok: false, error: "server error" }, 500);
  }
});
