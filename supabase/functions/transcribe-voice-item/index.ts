import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  loadVoiceItemForUser,
  transcribeStoredVoiceItem,
  type VoiceGatewayCredentials,
} from "../_shared/voice-ingest.ts";
import { needsVoiceTranscription } from "../_shared/voice-text.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "not_authenticated" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON || SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "not_authenticated" }, 401);
  }
  const userId = userData.user.id;

  let itemId = "";
  try {
    const body = (await req.json()) as { itemId?: unknown };
    itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!itemId) {
    return json({ error: "item_id_required" }, 400);
  }

  const supabase = adminClient();
  const row = await loadVoiceItemForUser(supabase, userId, itemId);
  if (!row) {
    return json({ error: "item_not_found" }, 404);
  }

  if (!needsVoiceTranscription(row.title, row.content)) {
    return json({
      ok: true,
      itemId: row.id,
      title: row.title,
      content: row.content,
      alreadyTranscribed: true,
    });
  }

  const { data: gatewayData } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id,api_token,api_url")
    .eq("user_id", userId)
    .maybeSingle();
  const gateway = (gatewayData as VoiceGatewayCredentials | null) ?? null;

  try {
    const transcribed = await transcribeStoredVoiceItem(supabase, row, gateway);
    return json({
      ok: true,
      itemId: row.id,
      title: transcribed.title,
      content: transcribed.content,
    });
  } catch (error) {
    return json(
      {
        error: "transcription_failed",
        reason: error instanceof Error ? error.message : "unknown",
      },
      502,
    );
  }
});
