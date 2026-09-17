import { currentAccessToken, currentUserId } from "./whatsapp-gateway";
import { requireSupabase } from "./supabase";
import {
  transcribeHebrewAudioBlob,
  transcribeHebrewAudioUrl,
} from "../../../convex/lib/ingest/hebrewAsrPublicClient";
import { titleFromInboundText } from "./voice-text";
import type { MindtaskerItem, SourceMaterial } from "../types";

export interface TranscribeVoiceItemResult {
  ok: boolean;
  itemId: string;
  title: string;
  content: string;
  alreadyTranscribed?: boolean;
}

export type VoiceRepairItem = Pick<
  MindtaskerItem,
  "id" | "title" | "content" | "metadata" | "source_material_id"
> & {
  source_materials?: SourceMaterial | null | SourceMaterial[];
};

function parseTranscribePayload(
  data: unknown,
  itemId: string,
): TranscribeVoiceItemResult | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if ("stateInstance" in record || "qrBase64" in record) return null;
  if (typeof record.error === "string" && record.error.length > 0) {
    throw new Error(record.error);
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return null;
  return {
    ok: true,
    itemId: typeof record.itemId === "string" ? record.itemId : itemId,
    title,
    content: typeof record.content === "string" ? record.content : "",
    alreadyTranscribed: record.alreadyTranscribed === true,
  };
}

async function invokeWithTimeout<T>(
  work: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("transcription_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function firstSource(item: VoiceRepairItem): SourceMaterial | null {
  const source = Array.isArray(item.source_materials)
    ? item.source_materials[0]
    : item.source_materials;
  return source ?? null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function resolveAudioUrl(item: VoiceRepairItem): Promise<string | null> {
  const source = firstSource(item);
  const stored = source?.storage_url?.trim() ?? "";
  if (isHttpUrl(stored)) return stored;
  if (!stored || stored.includes("://") || !stored.includes("/")) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase.storage
    .from("source-materials")
    .createSignedUrl(stored, 180);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function persistClientTranscript(
  item: VoiceRepairItem,
  title: string,
  content: string,
  engine: string,
): Promise<void> {
  const supabase = requireSupabase();
  const metadata = {
    ...(typeof item.metadata === "object" && item.metadata ? item.metadata : {}),
    whisper_transcription: content,
    corrected_transcription: content,
    asr_engine: engine,
  };
  const { error } = await supabase
    .from("mindtasker_items")
    .update({
      title,
      content,
      metadata,
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", item.id);
  if (error) {
    throw new Error(error.message || "שמירת התמלול נכשלה");
  }
  const source = firstSource(item);
  if (!source?.id) return;
  const sourceMeta =
    source.metadata && typeof source.metadata === "object"
      ? (source.metadata as Record<string, unknown>)
      : {};
  await supabase
    .from("source_materials")
    .update({
      raw_text: content,
      metadata: {
        ...sourceMeta,
        whisper_transcription: content,
        corrected_transcription: content,
        asr_engine: engine,
      },
    })
    .eq("id", source.id);
}

async function transcribeViaPublicAsr(
  item: VoiceRepairItem,
): Promise<TranscribeVoiceItemResult> {
  const audioUrl = await resolveAudioUrl(item);
  if (!audioUrl) {
    throw new Error("voice_audio_url_missing");
  }
  let transcribed;
  try {
    transcribed = await transcribeHebrewAudioUrl(audioUrl);
  } catch {
    const direct = await fetch(audioUrl);
    if (!direct.ok) {
      throw new Error(`audio_download_failed:${direct.status}`);
    }
    const blob = await direct.blob();
    transcribed = await transcribeHebrewAudioBlob(blob, "whatsapp-voice.ogg");
  }
  const title = transcribed.title || titleFromInboundText(transcribed.correctedText);
  await persistClientTranscript(
    item,
    title,
    transcribed.correctedText,
    transcribed.engine,
  );
  return {
    ok: true,
    itemId: item.id,
    title,
    content: transcribed.correctedText,
  };
}

export async function invokeTranscribeVoiceItem(
  item: VoiceRepairItem | string,
): Promise<TranscribeVoiceItemResult> {
  const itemId = typeof item === "string" ? item : item.id;
  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    const connect = await invokeWithTimeout(
      supabase.functions.invoke("whatsapp-green-connect", {
        headers,
        body: { action: "transcribeItem", itemId },
      }),
      20_000,
    );
    if (!connect.error) {
      const parsed = parseTranscribePayload(connect.data, itemId);
      if (parsed) return parsed;
    }
  } catch {
    // Live connect is the old QR-only function — keep going.
  }

  try {
    const dedicated = await invokeWithTimeout(
      supabase.functions.invoke("transcribe-voice-item", {
        headers,
        body: { itemId },
      }),
      20_000,
    );
    if (!dedicated.error) {
      const parsed = parseTranscribePayload(dedicated.data, itemId);
      if (parsed) return parsed;
    }
  } catch {
    // Function is not deployed in production yet.
  }

  if (typeof item === "string") {
    throw new Error("תמלול ההודעה הקולית נכשל");
  }
  return transcribeViaPublicAsr(item);
}

export async function persistRecordedVoiceTranscript(params: {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
}): Promise<TranscribeVoiceItemResult> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");
  const transcribed = await transcribeHebrewAudioBlob(params.blob, params.fileName);
  const supabase = requireSupabase();
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "whatsapp_voice",
      raw_text: transcribed.rawText,
      storage_url: null,
      metadata: {
        channel: "app",
        duration_seconds: params.durationSeconds ?? null,
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        asr_engine: transcribed.engine,
      },
    })
    .select("id")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }
  const { data: inserted, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert({
      user_id: userId,
      source_material_id: source?.id ?? null,
      title: transcribed.title,
      content: transcribed.correctedText,
      is_actionable: true,
      status: "inbox",
      tags: [],
      metadata: {
        source: "app_voice",
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        asr_engine: transcribed.engine,
        duration_seconds: params.durationSeconds ?? null,
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }
  return {
    ok: true,
    itemId: inserted.id as string,
    title: transcribed.title,
    content: transcribed.correctedText,
  };
}
