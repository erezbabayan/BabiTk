/**
 * Shared WhatsApp voice transcription + item update for Edge Functions.
 * Incoming audio is transcribed once. Existing placeholders are repaired
 * one row at a time — never a full-table scan on every webhook.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import type { ParsedGreenApiMessage } from "./green-api.ts";
import { resolveGreenApiMediaUrl, type GreenApiMediaCredentials } from "./green-api-media.ts";
import {
  audioFileName,
  downloadAudioBytes,
  isHttpUrl,
  isStorageObjectPath,
  transcribeAndProofreadVoice,
} from "./hebrew-voice-asr.ts";
import {
  isVoicePlaceholderText,
  needsVoiceTranscription,
  VOICE_PENDING_TITLE,
  VOICE_TRANSCRIBING_TITLE,
  VOICE_UNAVAILABLE_TITLE,
} from "./voice-text.ts";
import { parseWhatsAppVoiceQuestion } from "./whatsapp-system-question.ts";
import { loadAllowedTagNames, parseIncomingMessage } from "./parse-incoming-message.ts";
import { sendGreenApiText } from "./green-api-send.ts";
import { buildCaptureConfirmation } from "./whatsapp-intents.ts";
import {
  interceptRecordedWhatsAppTranscript,
  rememberWhatsAppLastItemIds,
  resolveCaptureChatId,
} from "./whatsapp-system-question-reply.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface VoiceGatewayCredentials {
  instance_id: string;
  api_token: string;
  api_url: string;
}

export interface VoiceItemRow {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  source_material_id: string | null;
  source_materials:
    | { id: string; storage_url: string | null; metadata: Record<string, unknown> | null }
    | Array<{ id: string; storage_url: string | null; metadata: Record<string, unknown> | null }>
    | null;
}

export const VOICE_PLACEHOLDER_FILTER =
  "title.eq.הודעה קולית מוואטסאפ,content.eq.הודעה קולית מוואטסאפ,title.eq.הודעה קולית,content.eq.הודעה קולית,title.eq.ממתין לתמלול,title.eq.מתמלל…";

function gatewayCredentials(
  gateway: VoiceGatewayCredentials | null,
): GreenApiMediaCredentials | null {
  if (!gateway) return null;
  return {
    instanceId: gateway.instance_id,
    apiToken: gateway.api_token,
    apiUrl: gateway.api_url,
  };
}

export function firstSourceMaterial(row: VoiceItemRow): {
  id: string;
  storage_url: string | null;
  metadata: Record<string, unknown> | null;
} | null {
  const source = Array.isArray(row.source_materials)
    ? row.source_materials[0]
    : row.source_materials;
  return source && typeof source === "object" && "id" in source ? source : null;
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string {
  if (!metadata || !(key in metadata)) return "";
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

async function downloadFromStorage(
  supabase: AdminClient,
  path: string,
  mimeTypeHint?: string | null,
): Promise<{ bytes: Uint8Array; mimeType: string; audioUrl: string }> {
  const { data, error } = await supabase.storage.from("source-materials").download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "storage_download_failed");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength < 64) {
    throw new Error("audio_too_short");
  }
  return {
    bytes,
    mimeType: mimeTypeHint || data.type || "audio/webm",
    audioUrl: path,
  };
}

async function downloadVoiceAudio(params: {
  supabase?: AdminClient;
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials: GreenApiMediaCredentials | null;
  mimeType?: string | null;
}): Promise<{ bytes: Uint8Array; mimeType: string; audioUrl: string }> {
  if (params.supabase && isStorageObjectPath(params.downloadUrl)) {
    return downloadFromStorage(params.supabase, params.downloadUrl!.trim(), params.mimeType);
  }

  let audioUrl = await resolveGreenApiMediaUrl({
    downloadUrl: isHttpUrl(params.downloadUrl) ? params.downloadUrl : null,
    chatId: params.chatId,
    messageId: params.messageId,
    credentials: params.credentials,
  });
  if (!audioUrl) {
    throw new Error("voice_audio_url_missing");
  }

  try {
    const downloaded = await downloadAudioBytes(audioUrl);
    return {
      bytes: downloaded.bytes,
      mimeType: params.mimeType || downloaded.mimeType,
      audioUrl,
    };
  } catch (error) {
    if (!params.credentials) throw error;
    audioUrl = await resolveGreenApiMediaUrl({
      downloadUrl: null,
      chatId: params.chatId,
      messageId: params.messageId,
      credentials: params.credentials,
    });
    if (!audioUrl) throw error;
    const downloaded = await downloadAudioBytes(audioUrl);
    return {
      bytes: downloaded.bytes,
      mimeType: params.mimeType || downloaded.mimeType,
      audioUrl,
    };
  }
}

function isRetryableVoiceAsrError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /voice_audio_url_missing|audio_too_short|download|404|not found|failed to fetch|fetch failed|media/i.test(
    message,
  );
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Green-API media is often not ready on the first webhook tick. Retry quickly. */
export async function transcribeVoiceMessageWithRetry(
  message: ParsedGreenApiMessage,
  gateway: VoiceGatewayCredentials | null,
  supabase?: AdminClient,
  attempts = 3,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  const delaysMs = [0, 700, 1600];
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    const delay = delaysMs[index] ?? 1600;
    if (delay > 0) await waitMs(delay);
    try {
      const transcribed = await transcribeVoiceMessage(message, gateway, supabase);
      if (!needsVoiceTranscription(transcribed.title, transcribed.content)) {
        return transcribed;
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableVoiceAsrError(error)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("voice_asr_failed");
}

export async function transcribeVoiceMessage(
  message: ParsedGreenApiMessage,
  gateway: VoiceGatewayCredentials | null,
  supabase?: AdminClient,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  const downloaded = await downloadVoiceAudio({
    supabase,
    downloadUrl: message.audioUrl,
    chatId: message.chatId,
    messageId: message.messageId,
    credentials: gatewayCredentials(gateway),
    mimeType: message.mimeType,
  });
  const transcribed = await transcribeAndProofreadVoice({
    audio: downloaded.bytes,
    mimeType: downloaded.mimeType || "audio/ogg",
    fileName: audioFileName(message.messageId, downloaded.mimeType || "audio/ogg"),
    promptHint: "בבי מה המשימות היום מחר לשבוע הבא תפריט",
    hotPath: true,
  });
  if (isVoicePlaceholderText(transcribed.correctedText)) {
    throw new Error("voice_placeholder_rejected");
  }
  return {
    sourceType: "whatsapp_voice",
    title: transcribed.title,
    content: transcribed.correctedText,
    rawText: transcribed.rawText,
    audioUrl: downloaded.audioUrl,
  };
}

export function pendingVoiceItem(audioUrl: string | null): {
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
} {
  return {
    sourceType: "whatsapp_voice",
    title: VOICE_PENDING_TITLE,
    content: "",
    rawText: "",
    audioUrl,
  };
}

export async function applyVoiceTranscription(
  supabase: AdminClient,
  row: VoiceItemRow,
  transcribed: {
    title: string;
    content: string;
    rawText: string;
    audioUrl?: string | null;
    engine?: string;
  },
): Promise<void> {
  const source = firstSourceMaterial(row);
  const previousSource =
    typeof row.metadata?.source === "string" && row.metadata.source.trim()
      ? row.metadata.source
      : "whatsapp_voice";
  const metadata = {
    ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
    source: previousSource,
    whisper_transcription: transcribed.rawText,
    corrected_transcription: transcribed.content,
    voice_transcribe_started_at: null,
    voice_refine_pending: false,
    ...(transcribed.engine ? { asr_engine: transcribed.engine } : {}),
  };
  const allowedTags = await loadAllowedTagNames(
    supabase,
    row.user_id ?? "",
  );
  const parsed = row.user_id
    ? parseIncomingMessage(transcribed.content, allowedTags)[0]
    : undefined;
  const { error: itemError } = await supabase
    .from("mindtasker_items")
    .update({
      title: parsed?.title || transcribed.title,
      content: parsed?.content || transcribed.content,
      is_actionable: parsed?.is_actionable ?? true,
      due_date: parsed?.due_date ?? null,
      tags: parsed?.tags ?? [],
      last_interacted_at: new Date().toISOString(),
      metadata,
    })
    .eq("id", row.id);
  if (itemError) {
    throw new Error(itemError.message);
  }
  if (!source?.id) return;
  await supabase
    .from("source_materials")
    .update({
      raw_text: transcribed.rawText,
      storage_url: transcribed.audioUrl ?? source.storage_url,
      metadata: {
        ...(typeof source.metadata === "object" && source.metadata ? source.metadata : {}),
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.content,
      },
    })
    .eq("id", source.id);
}

export async function findVoiceItemByWhatsAppMessage(
  supabase: AdminClient,
  userId: string,
  messageId: string,
): Promise<VoiceItemRow | null> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      "id, user_id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
    )
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as VoiceItemRow;
}

async function loadUserGateway(
  supabase: AdminClient,
  userId: string,
): Promise<VoiceGatewayCredentials | null> {
  const { data } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id, api_token, api_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return data as VoiceGatewayCredentials;
}

async function softDeleteVoiceItemAsQuestion(
  supabase: AdminClient,
  row: VoiceItemRow,
  transcribed: { rawText: string; content: string },
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("mindtasker_items")
    .update({
      deleted_at: new Date().toISOString(),
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
        source: metadataString(row.metadata, "source") || "whatsapp_voice",
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.content,
        system_question: true,
        voice_transcribe_started_at: null,
      },
    })
    .eq("id", row.id);
  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

export async function interceptVoiceItemQuestion(
  supabase: AdminClient,
  row: VoiceItemRow,
  transcribed: { title: string; content: string; rawText: string },
  gateway: VoiceGatewayCredentials | null,
): Promise<boolean> {
  if (!row.user_id) return false;
  const chatId = metadataString(row.metadata, "chat_id");
  const messageId = metadataString(row.metadata, "whatsapp_message_id") || row.id;
  const handled = await interceptRecordedWhatsAppTranscript({
    supabase,
    userId: row.user_id,
    chatId,
    messageId,
    sourceType: "whatsapp_voice",
    gateway: gateway ?? (await loadUserGateway(supabase, row.user_id)),
    rawText: transcribed.content || transcribed.rawText,
  });
  if (!handled) return false;
  try {
    await softDeleteVoiceItemAsQuestion(supabase, row, transcribed);
  } catch (error) {
    console.error("voice question placeholder delete failed", error);
  }
  return true;
}

export async function transcribeStoredVoiceItem(
  supabase: AdminClient,
  row: VoiceItemRow,
  gateway: VoiceGatewayCredentials | null,
): Promise<{
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
  answered?: boolean;
}> {
  if (!needsVoiceTranscription(row.title, row.content)) {
    return {
      rawText: row.content,
      content: row.content,
      title: row.title,
      audioUrl: firstSourceMaterial(row)?.storage_url ?? null,
    };
  }
  const source = firstSourceMaterial(row);
  const messageId = metadataString(row.metadata, "whatsapp_message_id") || row.id;
  const chatId = metadataString(row.metadata, "chat_id");
  const transcribed = await transcribeVoiceMessageWithRetry(
    {
      messageId,
      senderId: "",
      senderPhone: "",
      chatId,
      direction: "incoming",
      type: "audio",
      audioUrl: source?.storage_url || undefined,
    },
    gateway,
    supabase,
  );
  try {
    if (await interceptVoiceItemQuestion(supabase, row, transcribed, gateway)) {
      return { ...transcribed, answered: true };
    }
  } catch (error) {
    console.error("voice system question reply failed", error);
  }
  await applyVoiceTranscription(supabase, row, transcribed);
  try {
    await sendVoiceCaptureConfirmation(supabase, row, transcribed, gateway);
  } catch (error) {
    console.error("voice capture confirmation failed", error);
  }
  return transcribed;
}

async function sendVoiceCaptureConfirmation(
  supabase: AdminClient,
  row: VoiceItemRow,
  transcribed: { title: string; content: string },
  gateway: VoiceGatewayCredentials | null,
): Promise<void> {
  if (!row.user_id) return;
  if (needsVoiceTranscription(transcribed.title, transcribed.content)) return;
  const chatId =
    metadataString(row.metadata, "chat_id") ||
    (await resolveCaptureChatId(supabase, row.user_id));
  if (!chatId) return;
  await rememberWhatsAppLastItemIds(supabase, row.user_id, [row.id]);
  await sendGreenApiText(
    gateway ?? (await loadUserGateway(supabase, row.user_id)),
    chatId,
    buildCaptureConfirmation([{ title: transcribed.title }]),
  );
}

/** Repair at most one leftover placeholder. Safe to call after inbound ingest. */
export async function repairOnePlaceholderVoiceItem(
  supabase: AdminClient,
  userId: string,
  gateway: VoiceGatewayCredentials | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      "id, user_id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(VOICE_PLACEHOLDER_FILTER)
    .limit(1);
  if (error || !data?.[0]) return false;
  const row = data[0] as VoiceItemRow;
  if (!needsVoiceTranscription(row.title, row.content)) return false;
  try {
    await transcribeStoredVoiceItem(supabase, row, gateway);
    return true;
  } catch (error) {
    console.error("placeholder voice repair failed", error);
    await markVoiceItemUnavailable(supabase, row);
    return false;
  }
}

export async function markVoiceItemUnavailable(
  supabase: AdminClient,
  row: VoiceItemRow,
): Promise<void> {
  const { error } = await supabase
    .from("mindtasker_items")
    .update({
      title: VOICE_UNAVAILABLE_TITLE,
      last_interacted_at: new Date().toISOString(),
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
        voice_transcribe_started_at: null,
        voice_refine_pending: false,
      },
    })
    .eq("id", row.id);
  if (error) {
    console.error("mark voice unavailable failed", error);
  }
}

/** Finish ASR in the same request. waitUntil is killed before Groq returns. */
export async function awaitStoredVoiceTranscription(
  supabase: AdminClient,
  row: VoiceItemRow,
  gateway: VoiceGatewayCredentials | null,
): Promise<{ answered?: boolean; title: string } | null> {
  if (!needsVoiceTranscription(row.title, row.content)) {
    return { title: row.title };
  }
  try {
    const transcribed = await transcribeStoredVoiceItem(supabase, row, gateway);
    return { answered: transcribed.answered, title: transcribed.title };
  } catch (error) {
    console.error("stored voice transcription failed", error);
    await markVoiceItemUnavailable(supabase, row);
    return null;
  }
}

export function scheduleBackgroundWork(task: Promise<unknown>): void {
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  const guarded = task.catch((error) => {
    console.error("background voice task failed", error);
  });
  if (runtime?.waitUntil) {
    runtime.waitUntil(guarded);
    return;
  }
  void guarded;
}

export async function loadVoiceItemForUser(
  supabase: AdminClient,
  userId: string,
  itemId: string,
): Promise<VoiceItemRow | null> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      "id, user_id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
    )
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as VoiceItemRow;
}

async function loadVoiceItemForUserWithRetry(
  supabase: AdminClient,
  userId: string,
  itemId: string,
): Promise<VoiceItemRow | null> {
  for (const delayMs of [0, 160, 400]) {
    if (delayMs > 0) await waitMs(delayMs);
    const row = await loadVoiceItemForUser(supabase, userId, itemId);
    if (row) return row;
  }
  return null;
}

export type IngestRecordedAudioResult = {
  itemId?: string;
  answered?: boolean;
  title: string;
  content: string;
  rawText: string;
};

export async function ingestRecordedAudio(
  supabase: AdminClient,
  userId: string,
  params: {
    bytes: Uint8Array;
    mimeType: string;
    fileName: string;
    durationSeconds?: number;
    promptHint?: string;
    itemId?: string;
  },
): Promise<IngestRecordedAudioResult> {
  const storagePath = `${userId}/${Date.now()}-${params.fileName}`;
  const audioBlob = new Blob([new Uint8Array(params.bytes)], { type: params.mimeType });
  const uploadPromise = supabase.storage.from("source-materials").upload(storagePath, audioBlob, {
    contentType: params.mimeType,
    upsert: false,
  });
  const gatewayPromise = loadUserGateway(supabase, userId);
  const chatIdPromise = resolveCaptureChatId(supabase, userId);
  const existingPromise = params.itemId
    ? loadVoiceItemForUserWithRetry(supabase, userId, params.itemId)
    : Promise.resolve(null);

  const transcribed = await transcribeAndProofreadVoice({
    audio: params.bytes,
    mimeType: params.mimeType,
    fileName: params.fileName,
    promptHint: params.promptHint,
    hotPath: true,
  });
  if (isVoicePlaceholderText(transcribed.correctedText)) {
    throw new Error("voice_placeholder_rejected");
  }

  const [gateway, chatId, existing] = await Promise.all([
    gatewayPromise,
    chatIdPromise,
    existingPromise,
  ]);

  if (parseWhatsAppVoiceQuestion(transcribed.correctedText).kind !== "none") {
    const handled = await interceptRecordedWhatsAppTranscript({
      supabase,
      userId,
      chatId,
      messageId: `app-voice-${Date.now()}`,
      sourceType: "whatsapp_voice",
      gateway,
      rawText: transcribed.correctedText,
    });
    if (handled) {
      if (existing) {
        try {
          await softDeleteVoiceItemAsQuestion(supabase, existing, transcribed);
        } catch (error) {
          console.error("voice question placeholder delete failed", error);
        }
      }
      return {
        answered: true,
        itemId: existing?.id ?? params.itemId,
        title: transcribed.title,
        content: transcribed.correctedText,
        rawText: transcribed.rawText,
      };
    }
  }

  let storedPath: string | null = storagePath;
  const { error: uploadError } = await uploadPromise;
  if (uploadError) {
    console.error("voice storage upload failed", uploadError.message);
    storedPath = null;
  }

  const row =
    existing ??
    (params.itemId
      ? {
          id: params.itemId,
          user_id: userId,
          title: params.promptHint?.trim() || VOICE_TRANSCRIBING_TITLE,
          content: params.promptHint?.trim() || "",
          metadata: { source: "app_voice" },
          source_material_id: null,
          source_materials: null,
        }
      : null);

  if (row) {
    await applyVoiceTranscription(supabase, row, {
      title: transcribed.title,
      content: transcribed.correctedText,
      rawText: transcribed.rawText,
      audioUrl: storedPath,
      engine: transcribed.engine,
    });
    return {
      itemId: row.id,
      title: transcribed.title,
      content: transcribed.correctedText,
      rawText: transcribed.rawText,
    };
  }

  const allowedTags = await loadAllowedTagNames(supabase, userId);
  const parsed = parseIncomingMessage(transcribed.correctedText, allowedTags)[0];
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "whatsapp_voice",
      raw_text: transcribed.rawText,
      storage_url: storedPath,
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
      title: parsed?.title || transcribed.title,
      content: parsed?.content || transcribed.correctedText,
      is_actionable: parsed?.is_actionable ?? true,
      status: "inbox",
      due_date: parsed?.due_date ?? null,
      tags: parsed?.tags ?? [],
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
    itemId: inserted.id as string,
    title: transcribed.title,
    content: transcribed.correctedText,
    rawText: transcribed.rawText,
  };
}
