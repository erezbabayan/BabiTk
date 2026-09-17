import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { decodeAudioBase64, audioFileName } from "../_shared/hebrew-voice-asr.ts";
import { ingestRecordedAudio } from "../_shared/voice-ingest.ts";

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

  let audioBase64 = "";
  let mimeType = "audio/webm";
  let fileName = "";
  let durationSeconds: number | undefined;
  try {
    const body = (await req.json()) as {
      audioBase64?: unknown;
      mimeType?: unknown;
      fileName?: unknown;
      durationSeconds?: unknown;
    };
    audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    if (typeof body.mimeType === "string" && body.mimeType.trim()) {
      mimeType = body.mimeType.trim();
    }
    if (typeof body.fileName === "string") {
      fileName = body.fileName.trim();
    }
    if (typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)) {
      durationSeconds = Math.max(1, Math.round(body.durationSeconds));
    }
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!audioBase64) {
    return json({ error: "audio_required" }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeAudioBase64(audioBase64);
  } catch (error) {
    return json(
      { error: "invalid_audio", reason: error instanceof Error ? error.message : "decode_failed" },
      400,
    );
  }

  const resolvedName = fileName || audioFileName(`rec-${Date.now()}`, mimeType);

  try {
    const result = await ingestRecordedAudio(adminClient(), userId, {
      bytes,
      mimeType,
      fileName: resolvedName,
      durationSeconds,
    });
    return json({
      ok: true,
      answered: result.answered === true,
      itemId: result.itemId,
      title: result.title,
      content: result.content,
      text: result.content,
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
