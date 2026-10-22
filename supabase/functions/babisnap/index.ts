import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  BABISNAP_NAME,
  performBabisnapAction,
  type BabisnapStore,
  type DeviceTokenRow,
} from "../_shared/babisnap.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function readStatusRow(data: unknown): { connected: boolean; lastUsedAt: string | null } {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { connected: false, lastUsedAt: null };
  const record = row as { connected?: unknown; last_used_at?: unknown };
  return {
    connected: record.connected === true,
    lastUsedAt: typeof record.last_used_at === "string" && record.last_used_at ? record.last_used_at : null,
  };
}

function userStore(client: SupabaseClient, userId: string): BabisnapStore {
  return {
    async tokensForUser(): Promise<DeviceTokenRow[]> {
      const { data, error } = await client.rpc("babisnap_status");
      if (error) throw new Error("status_failed");
      const view = readStatusRow(data);
      if (!view.connected) return [];
      return [
        {
          userId,
          name: BABISNAP_NAME,
          tokenHash: "",
          lastUsedAt: view.lastUsedAt,
          revokedAt: null,
        },
      ];
    },
    async replaceBabisnap(_userId, tokenHash) {
      const { error } = await client.rpc("babisnap_connect", { p_token_hash: tokenHash });
      if (error) throw new Error("connect_failed");
    },
    async disconnectBabisnap() {
      const { error } = await client.rpc("babisnap_disconnect");
      if (error) throw new Error("disconnect_failed");
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON) return json({ ok: false, error: "server" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

  let action = "status";
  try {
    const payload = await req.json();
    if (payload && typeof payload === "object" && typeof (payload as { action?: unknown }).action === "string") {
      action = (payload as { action: string }).action;
    }
  } catch {
    action = "status";
  }

  try {
    const result = await performBabisnapAction(action, userData.user.id, userStore(userClient, userData.user.id));
    return json(result.body, result.status);
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }
});
