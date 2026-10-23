/**
 * Shared WhatsApp voice transcription + item update for Edge Functions.
 * Incoming audio is transcribed once. Existing placeholders are repaired
 * one row at a time — never a full-table scan on every webhook.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import type { ParsedGreenApiMessage } from "./green-api.ts";
import { resolveGreenApiMediaUrl, requestGreenApiDownloadFile, type GreenApiMediaCredentials } from "./green-api-media.ts";
import {
  audioFileName,
  downloadAudioBytes,
  isHttpUrl,
  isPublicMediaUrl,
  isStorageObjectPath,
  mimeForContainer,
  sniffAudioContainer,
  transcribeAndProofreadVoice,
} from "./hebrew-voice-asr.ts";
import {
  isVoicePlaceholderText,
  needsVoiceTranscription,
  VOICE_PENDING_TITLE,
  VOICE_TRANSCRIBING_TITLE,
  VOICE_UNAVAILABLE_TITLE,
  titleFromInboundText,
} from "./voice-text.ts";
import { classifyWhatsAppInbound } from "./whatsapp-inbound-route.ts";
import {
  VOICE_ASR_MAX_ATTEMPTS,
  voiceAsrAttemptsExhausted,
  voiceAsrErrorLabel,
  voiceAsrFinalMetadata,
  withVoiceAsrAttempt,
} from "./voice-asr-attempts.ts";
import { loadAllowedTagNames, parseIncomingMessage } from "./parse-incoming-message.ts";
import { sendGreenApiText } from "./green-api-send.ts";
import { queueCalendarSync } from "./google-calendar.ts";
import { buildCaptureConfirmation } from "./whatsapp-intents.ts";
import {
  interceptRecordedWhatsAppTranscript,
  rememberWhatsAppLastItemIds,
  resolveCaptureChatId,
} from "./whatsapp-system-question-reply.ts";
import { parseInboundText, layoutMetadataFromParsed } from "./inbound-item.ts";
import { enrichInboundRows } from "./whatsapp-enrich.ts";
import type { CaptureRow } from "./proactive-whatsapp.ts";
import {
  ensureWhatsAppMessageId,
  isSoftDeletedCapturedItem,
  isStableWhatsAppMessageId,
  preferLiveCapturedItem,
} from "./whatsapp-ingest-state.ts";

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
  deleted_at?: string | null;
  metadata: Record<string, unknown> | null;
  source_material_id: string | null;
  source_materials:
    | { id: string; storage_url: string | null; metadata: Record<string, unknown> | null }
    | Array<{ id: string; storage_url: string | null; metadata: Record<string, unknown> | null }>
    | null;
}

export { ensureWhatsAppMessageId, isStableWhatsAppMessageId };

export function isSoftDeletedVoiceItem(row: {
  deleted_at?: string | null;
}): boolean {
  return isSoftDeletedCapturedItem(row);
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
  const sniffed = sniffAudioContainer(bytes);
  return {
    bytes,
    mimeType: mimeForContainer(sniffed, mimeTypeHint || data.type || "audio/ogg"),
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

  const tryHttp = async (url: string) => {
    const downloaded = await downloadAudioBytes(url);
    return {
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType || params.mimeType || "audio/ogg",
      audioUrl: url,
    };
  };

  const fromApi = await requestGreenApiDownloadFile({
    chatId: params.chatId,
    messageId: params.messageId,
    credentials: params.credentials,
  });
  if (fromApi?.bytes && fromApi.bytes.byteLength >= 64) {
    const sniffed = sniffAudioContainer(fromApi.bytes);
    return {
      bytes: fromApi.bytes,
      mimeType: mimeForContainer(sniffed, fromApi.mimeType || params.mimeType || "audio/ogg"),
      audioUrl: fromApi.downloadUrl || params.downloadUrl || "",
    };
  }

  const candidateUrls = [
    fromApi?.downloadUrl,
    isPublicMediaUrl(params.downloadUrl) ? params.downloadUrl : null,
    isHttpUrl(params.downloadUrl) ? params.downloadUrl : null,
  ].filter((url): url is string => Boolean(url?.trim()));

  let lastError: unknown;
  for (const url of [...new Set(candidateUrls)]) {
    try {
      return await tryHttp(url);
    } catch (error) {
      lastError = error;
    }
  }

  const resolved = await resolveGreenApiMediaUrl({
    downloadUrl: null,
    chatId: params.chatId,
    messageId: params.messageId,
    credentials: params.credentials,
    preferApi: true,
  });
  if (resolved) {
    try {
      return await tryHttp(resolved);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("voice_audio_url_missing");
}

/** Retry only when Green-API media is not ready. Do not retry Gradio/ASR engine failures. */
export function isRetryableVoiceAsrError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /transcription_failed|gradio_|empty_transcription|missing_asr_keys|voice_placeholder_rejected/i.test(
      message,
    )
  ) {
    return false;
  }
  return /voice_audio_url_missing|audio_too_short|downloaded_not_audio|download|404|410|not found|media not ready/i.test(
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
  const maxAttempts = Math.min(attempts, delaysMs.length);
  for (let index = 0; index < maxAttempts; index += 1) {
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
    hotPath: true,
    sourceUrl: isPublicMediaUrl(downloaded.audioUrl) ? downloaded.audioUrl : undefined,
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

/** Persist the voice note before ASR so a webhook timeout still leaves a board row. */
export async function insertPendingWhatsAppVoiceItem(
  supabase: AdminClient,
  userId: string,
  message: ParsedGreenApiMessage,
): Promise<VoiceItemRow> {
  const existing = await findVoiceItemByWhatsAppMessage(supabase, userId, message.messageId);
  if (existing) return existing;
  if (await isWhatsAppMessageCaptured(supabase, userId, message.messageId)) {
    throw new Error("whatsapp_message_already_captured");
  }
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "whatsapp_voice",
      raw_text: "",
      storage_url: message.audioUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
      },
    })
    .select("id, storage_url, metadata")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const { data: inserted, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert({
      user_id: userId,
      source_material_id: source?.id ?? null,
      title: VOICE_PENDING_TITLE,
      content: "",
      is_actionable: false,
      status: "inbox",
      tags: [],
      due_date: null,
      metadata: {
        source: "whatsapp_voice",
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id, user_id, title, content, metadata, source_material_id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }
  return {
    id: String(inserted.id),
    user_id: String(inserted.user_id ?? userId),
    title: String(inserted.title ?? VOICE_PENDING_TITLE),
    content: String(inserted.content ?? ""),
    metadata:
      inserted.metadata && typeof inserted.metadata === "object"
        ? (inserted.metadata as Record<string, unknown>)
        : null,
    source_material_id: source?.id ?? null,
    source_materials: source
      ? {
          id: String(source.id),
          storage_url: source.storage_url ?? null,
          metadata:
            source.metadata && typeof source.metadata === "object"
              ? (source.metadata as Record<string, unknown>)
              : null,
        }
      : null,
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
  if (isSoftDeletedVoiceItem(row)) return;
  const { data: current } = await supabase
    .from("mindtasker_items")
    .select("deleted_at")
    .eq("id", row.id)
    .maybeSingle();
  if (current && isSoftDeletedVoiceItem(current)) return;
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
  let parsed:
    | {
        title: string;
        content: string;
        is_actionable: boolean;
        tags: string[];
        due_date: string | null;
        analysis: unknown;
        reminder_recurrence?: string | null;
        checklist?: Array<{ id: string; text: string; done: boolean }>;
      }
    | undefined;
  try {
    parsed = parseInboundText(transcribed.content, {
      sourceType: "whatsapp_voice",
      fallbackTitle: transcribed.title,
    })[0];
  } catch (error) {
    console.error("voice inbound parse failed, falling back", error);
  }
  if (!parsed && row.user_id) {
    const allowedTags = await loadAllowedTagNames(supabase, row.user_id);
    const fallback = parseIncomingMessage(transcribed.content, allowedTags)[0];
    if (fallback) {
      parsed = { ...fallback, analysis: undefined };
    }
  }
  const voiceCards = parsed
    ? enrichInboundRows(transcribed.content, [parsed as CaptureRow])
    : [];
  if (voiceCards.length > 1 && row.user_id) {
    parsed = voiceCards[0];
    const extras = voiceCards.slice(1);
    await supabase.from("mindtasker_items").insert(
      extras.map((card, index) => ({
        user_id: row.user_id,
        source_material_id: source?.id ?? null,
        title: card.title,
        content: card.content,
        is_actionable: true,
        status: "inbox",
        tags: card.tags,
        due_date: card.due_date,
        metadata: {
          source: "whatsapp_voice",
          ...layoutMetadataFromParsed(card),
          priority: card.priority ?? undefined,
        },
        sort_order: Date.now() + index + 1,
        last_interacted_at: new Date().toISOString(),
      })),
    );
  } else if (voiceCards[0]) {
    parsed = voiceCards[0];
  }
  const { error: itemError } = await supabase
    .from("mindtasker_items")
    .update({
      title: parsed?.title || transcribed.title,
      content: parsed?.content ?? transcribed.content,
      is_actionable:
        parsed?.is_actionable ?? (previousSource === "whatsapp_voice" ? false : true),
      due_date: parsed?.due_date ?? null,
      tags: parsed?.tags ?? [],
      last_interacted_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        ...(parsed?.analysis ? { analysis: parsed.analysis } : {}),
        ...layoutMetadataFromParsed(parsed ?? {}),
      },
    })
    .eq("id", row.id);
  if (itemError) {
    throw new Error(itemError.message);
  }
  if (row.user_id) {
    queueCalendarSync(supabase, row.user_id, row.id);
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

const VOICE_ITEM_SELECT =
  "id, user_id, title, content, deleted_at, metadata, source_material_id, source_materials ( id, storage_url, metadata )";

async function findSourceMaterialIdsByWhatsAppMessage(
  supabase: AdminClient,
  userId: string,
  messageId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("source_materials")
    .select("id")
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId)
    .limit(8);
  if (error || !data?.length) return [];
  return data
    .map((row) => (typeof row.id === "string" ? row.id : String(row.id ?? "")))
    .filter((id) => id.length > 0);
}

export async function findVoiceItemByWhatsAppMessage(
  supabase: AdminClient,
  userId: string,
  messageId: string,
): Promise<VoiceItemRow | null> {
  if (!isStableWhatsAppMessageId(messageId)) return null;
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(VOICE_ITEM_SELECT)
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId)
    .order("sort_order", { ascending: true })
    .limit(8);
  const fromItems = preferLiveCapturedItem((error ? [] : data ?? []) as VoiceItemRow[]);
  if (fromItems) return fromItems;

  const sourceIds = await findSourceMaterialIdsByWhatsAppMessage(
    supabase,
    userId,
    messageId,
  );
  if (sourceIds.length === 0) return null;
  const { data: bySource, error: sourceError } = await supabase
    .from("mindtasker_items")
    .select(VOICE_ITEM_SELECT)
    .eq("user_id", userId)
    .in("source_material_id", sourceIds)
    .order("sort_order", { ascending: true })
    .limit(8);
  return preferLiveCapturedItem(
    (sourceError ? [] : bySource ?? []) as VoiceItemRow[],
  );
}

export async function isWhatsAppMessageCaptured(
  supabase: AdminClient,
  userId: string,
  messageId: string,
): Promise<boolean> {
  if (!isStableWhatsAppMessageId(messageId)) return false;
  if (await findVoiceItemByWhatsAppMessage(supabase, userId, messageId)) {
    return true;
  }
  const sourceIds = await findSourceMaterialIdsByWhatsAppMessage(
    supabase,
    userId,
    messageId,
  );
  return sourceIds.length > 0;
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

export async function softDeleteVoiceItemAsQuestion(
  supabase: AdminClient,
  row: VoiceItemRow,
  transcribed: { rawText: string; content: string },
): Promise<void> {
  // Never leave "ממתין לתמלול" in the trash for an answered question.
  const questionText = (transcribed.content || transcribed.rawText || "").trim();
  const { error: deleteError } = await supabase
    .from("mindtasker_items")
    .update({
      deleted_at: new Date().toISOString(),
      ...(questionText && needsVoiceTranscription(row.title, row.content)
        ? { title: titleFromInboundText(questionText), content: questionText }
        : {}),
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
  const rawText = transcribed.content || transcribed.rawText;
  const route = classifyWhatsAppInbound(rawText);
  if (route.lane === "capture" || route.lane === "command") return false;
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
  /** manual: the user tapped "retry" in the app, so the background cap does not apply. */
  options: { manual?: boolean } = {},
): Promise<{
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
  answered?: boolean;
}> {
  if (isSoftDeletedVoiceItem(row)) {
    return {
      rawText: row.content,
      content: row.content,
      title: row.title,
      audioUrl: firstSourceMaterial(row)?.storage_url ?? null,
    };
  }
  if (!needsVoiceTranscription(row.title, row.content)) {
    return {
      rawText: row.content,
      content: row.content,
      title: row.title,
      audioUrl: firstSourceMaterial(row)?.storage_url ?? null,
    };
  }
  if (!options.manual && voiceAsrAttemptsExhausted(row.metadata)) {
    throw new Error("voice_asr_attempts_exhausted");
  }
  await recordVoiceAsrAttempt(supabase, row);
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

/** Count the attempt before ASR runs, so isolate timeouts are counted too. */
async function recordVoiceAsrAttempt(supabase: AdminClient, row: VoiceItemRow): Promise<void> {
  const metadata = withVoiceAsrAttempt(row.metadata);
  const { error } = await supabase
    .from("mindtasker_items")
    .update({ metadata })
    .eq("id", row.id)
    .is("deleted_at", null);
  if (error) {
    console.error("voice asr attempt counter failed", error.message);
    return;
  }
  row.metadata = metadata;
}

/**
 * Catch-up failure handling: keep the item pending (a later tick may succeed,
 * e.g. Green-API media not ready yet) until the attempt cap, then give it a
 * clear final status so it is never sent to ASR again.
 */
export async function handleVoiceCatchupFailure(
  supabase: AdminClient,
  row: VoiceItemRow,
  error: unknown,
): Promise<"final" | "retry_later"> {
  if (voiceAsrAttemptsExhausted(row.metadata, VOICE_ASR_MAX_ATTEMPTS)) {
    await markVoiceItemUnavailable(supabase, row, error);
    return "final";
  }
  const { error: updateError } = await supabase
    .from("mindtasker_items")
    .update({
      metadata: {
        ...(row.metadata ?? {}),
        voice_asr_last_error: voiceAsrErrorLabel(error),
        voice_transcribe_started_at: null,
      },
    })
    .eq("id", row.id)
    .is("deleted_at", null);
  if (updateError) console.error("voice catchup failure note failed", updateError.message);
  return "retry_later";
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
    await markVoiceItemUnavailable(supabase, row, error);
    return false;
  }
}

export async function markVoiceItemUnavailable(
  supabase: AdminClient,
  row: VoiceItemRow,
  cause?: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("mindtasker_items")
    .update({
      title: VOICE_UNAVAILABLE_TITLE,
      last_interacted_at: new Date().toISOString(),
      metadata: voiceAsrFinalMetadata(
        typeof row.metadata === "object" && row.metadata ? row.metadata : {},
        cause ?? "voice_asr_failed",
      ),
    })
    .eq("id", row.id)
    .is("deleted_at", null);
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
    await markVoiceItemUnavailable(supabase, row, error);
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
    liveCaption: params.promptHint,
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

  const route = classifyWhatsAppInbound(transcribed.correctedText);
  if (route.lane !== "capture" && route.lane !== "command") {
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

  let parsed:
    | {
        title: string;
        content: string;
        is_actionable: boolean;
        tags: string[];
        due_date: string | null;
        analysis?: unknown;
        reminder_recurrence?: string | null;
        checklist?: Array<{ id: string; text: string; done: boolean }>;
      }
    | undefined;
  try {
    parsed = parseInboundText(transcribed.correctedText, {
      sourceType: "whatsapp_voice",
      fallbackTitle: transcribed.title,
    })[0];
  } catch (error) {
    console.error("recorded voice inbound parse failed, falling back", error);
  }
  if (!parsed) {
    const allowedTags = await loadAllowedTagNames(supabase, userId);
    const fallback = parseIncomingMessage(transcribed.correctedText, allowedTags)[0];
    if (fallback) {
      parsed = { ...fallback, analysis: undefined };
    }
  }
  const recordedCards = parsed
    ? enrichInboundRows(transcribed.correctedText, [parsed as CaptureRow])
    : [];
  const extraRecordedCards = recordedCards.slice(1);
  if (recordedCards[0]) parsed = recordedCards[0];
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
      content: parsed?.content ?? transcribed.correctedText,
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
        ...(parsed?.analysis ? { analysis: parsed.analysis } : {}),
        ...layoutMetadataFromParsed(parsed ?? {}),
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }

  queueCalendarSync(supabase, userId, inserted.id as string);
  if (extraRecordedCards.length > 0) {
    await supabase.from("mindtasker_items").insert(
      extraRecordedCards.map((card, index) => ({
        user_id: userId,
        source_material_id: source?.id ?? null,
        title: card.title,
        content: card.content,
        is_actionable: true,
        status: "inbox",
        due_date: card.due_date,
        tags: card.tags,
        metadata: {
          source: "app_voice",
          ...layoutMetadataFromParsed(card),
        },
        sort_order: now + index + 1,
        last_interacted_at: new Date(now).toISOString(),
      })),
    );
  }

  return {
    itemId: inserted.id as string,
    title: parsed?.title || transcribed.title,
    content: transcribed.correctedText,
    rawText: transcribed.rawText,
  };
}
