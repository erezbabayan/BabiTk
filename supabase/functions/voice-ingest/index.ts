import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { queueCalendarSync } from "../_shared/google-calendar.ts";
import {
  handleVoiceIngest,
  jsonResponse,
  voiceErrorBody,
  type DeviceTokenRecord,
  type VoiceIngestStore,
} from "../_shared/device-voice-ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asTimestamps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse(voiceErrorBody("server", "missing server configuration"), 500);
  }
  const supabase = adminClient();
  const store: VoiceIngestStore = {
    async findToken(tokenHash): Promise<DeviceTokenRecord | null> {
      const { data, error } = await supabase
        .from("device_tokens")
        .select("id, user_id, revoked_at, request_timestamps")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        userId: String(data.user_id),
        revokedAt: typeof data.revoked_at === "string" ? data.revoked_at : null,
        requestTimestamps: asTimestamps(data.request_timestamps),
      };
    },
    async findByClientId(userId, clientId) {
      const { data, error } = await supabase
        .from("mindtasker_items")
        .select("id, due_date")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .filter("metadata->>voice_client_id", "eq", clientId)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        dueAt: typeof data.due_date === "string" ? data.due_date : null,
      };
    },
    async saveRateLimit(tokenId, timestamps, lastUsedAt) {
      const { error } = await supabase
        .from("device_tokens")
        .update({ request_timestamps: timestamps, last_used_at: lastUsedAt })
        .eq("id", tokenId);
      if (error) throw new Error(error.message);
    },
    async touchToken(tokenId, lastUsedAt) {
      const { error } = await supabase
        .from("device_tokens")
        .update({ last_used_at: lastUsedAt })
        .eq("id", tokenId);
      if (error) throw new Error(error.message);
    },
    async insertTask(input) {
      const now = new Date().toISOString();
      const { data: source, error: sourceError } = await supabase
        .from("source_materials")
        .insert({
          user_id: input.userId,
          source_type: "voice",
          raw_text: input.content || input.title,
          metadata: { channel: "voice", source: "voice" },
        })
        .select("id")
        .single();
      if (sourceError) throw new Error(sourceError.message);

      const { data, error } = await supabase
        .from("mindtasker_items")
        .insert({
          user_id: input.userId,
          source_material_id: source?.id ?? null,
          title: input.title,
          content: input.content,
          is_actionable: input.isActionable,
          status: input.status,
          tags: [],
          due_date: input.dueAt,
          metadata: input.metadata,
          sort_order: Date.now(),
          last_interacted_at: now,
        })
        .select("id, due_date")
        .single();
      if (error) {
        if (error.code === "23505") return { conflict: true as const };
        throw new Error(error.message);
      }
      const task = {
        id: String(data.id),
        dueAt: typeof data.due_date === "string" ? data.due_date : input.dueAt,
      };
      queueCalendarSync(supabase, input.userId, task.id);
      return task;
    },
  };

  try {
    return await handleVoiceIngest(req, store);
  } catch (error) {
    console.error("voice-ingest failed", error);
    return jsonResponse(voiceErrorBody("server", "could not create task"), 500);
  }
});
