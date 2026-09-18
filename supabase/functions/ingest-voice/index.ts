import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { decodeAudioBase64, audioFileName, normalizeAsrUpload } from "../_shared/hebrew-voice-asr.ts";
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

function optionalString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : undefined;
}

function isBlobLike(value: FormDataEntryValue | null): value is Blob {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Blob).arrayBuffer === "function",
  );
}

async function readIngestRequest(req: Request): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  promptHint: string;
  itemId: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const mimeType =
      optionalString(form.get("mimeType")) ||
      (isBlobLike(file) && file.type) ||
      "audio/webm";
    const fileName =
      optionalString(form.get("fileName")) ||
      (file instanceof File ? file.name : "") ||
      audioFileName(`rec-${Date.now()}`, mimeType);
    if (!isBlobLike(file) && typeof file !== "string") {
      throw new Error("audio_required");
    }
    const bytes =
      isBlobLike(file)
        ? new Uint8Array(await file.arrayBuffer())
        : decodeAudioBase64(file);
    if (bytes.byteLength < 64) {
      throw new Error("audio_too_short");
    }
    return {
      bytes,
      mimeType,
      fileName,
      durationSeconds: optionalNumber(form.get("durationSeconds")),
      promptHint: optionalString(form.get("promptHint")),
      itemId: optionalString(form.get("itemId")),
    };
  }

  const body = (await req.json()) as {
    audioBase64?: unknown;
    mimeType?: unknown;
    fileName?: unknown;
    durationSeconds?: unknown;
    promptHint?: unknown;
    itemId?: unknown;
  };
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  if (!audioBase64) {
    throw new Error("audio_required");
  }
  const mimeType =
    typeof body.mimeType === "string" && body.mimeType.trim()
      ? body.mimeType.trim()
      : "audio/webm";
  const fileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? body.fileName.trim()
      : audioFileName(`rec-${Date.now()}`, mimeType);
  const durationSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(1, Math.round(body.durationSeconds))
      : undefined;
  return {
    bytes: decodeAudioBase64(audioBase64),
    mimeType,
    fileName,
    durationSeconds,
    promptHint: typeof body.promptHint === "string" ? body.promptHint.trim() : "",
    itemId: typeof body.itemId === "string" ? body.itemId.trim() : "",
  };
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

  let payload: Awaited<ReturnType<typeof readIngestRequest>>;
  try {
    payload = await readIngestRequest(req);
    const upload = normalizeAsrUpload(payload.fileName, payload.mimeType);
    payload = { ...payload, mimeType: upload.mimeType, fileName: upload.fileName };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_audio";
    return json(
      { error: reason === "audio_required" ? "audio_required" : "invalid_audio", reason },
      400,
    );
  }

  try {
    const result = await ingestRecordedAudio(adminClient(), userId, {
      bytes: payload.bytes,
      mimeType: payload.mimeType,
      fileName: payload.fileName,
      durationSeconds: payload.durationSeconds,
      promptHint: payload.promptHint || undefined,
      itemId: payload.itemId || undefined,
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
