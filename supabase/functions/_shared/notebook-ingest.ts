import { createClient } from "npm:@supabase/supabase-js@2";

import {
  isHttpUrl,
  isPublicMediaUrl,
  isStorageObjectPath,
} from "./hebrew-voice-asr.ts";
import {
  isLikelyImageBytes,
  mimeForImageContainer,
  sniffImageContainer,
} from "./image-bytes.ts";
import {
  parseGreenApiDownloadFileBody,
  requestGreenApiDownloadFile,
  resolveGreenApiMediaUrl,
  type GreenApiMediaCredentials,
} from "./green-api-media.ts";
import { parseInboundText, layoutMetadataFromParsed } from "./inbound-item.ts";
import {
  isVisionOcrConfigured,
  notebookBodyFromOcr,
  transcribeAndProofreadImage,
} from "./notebook-ocr.ts";
import { loadAllowedTagNames, parseIncomingMessage } from "./parse-incoming-message.ts";
import { queueCalendarSync } from "./google-calendar.ts";
import type { ParsedGreenApiMessage } from "./green-api.ts";
import {
  findVoiceItemByWhatsAppMessage,
  scheduleBackgroundWork,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "./voice-ingest.ts";
import {
  OCR_PENDING_TITLE,
  OCR_UNAVAILABLE_TITLE,
  needsOcrTranscription,
  titleFromInboundText,
} from "./voice-text.ts";

type AdminClient = ReturnType<typeof createClient>;

export type ImageItemRow = VoiceItemRow;

function gatewayCredentials(
  gateway: VoiceGatewayCredentials | null,
): GreenApiMediaCredentials | null {
  if (!gateway?.instance_id || !gateway.api_token) return null;
  return {
    instanceId: gateway.instance_id,
    apiToken: gateway.api_token,
    apiUrl: gateway.api_url,
  };
}

function firstSourceMaterial(row: ImageItemRow): {
  id: string;
  storage_url: string | null;
  metadata: Record<string, unknown> | null;
} | null {
  const source = row.source_materials;
  if (!source) return null;
  if (Array.isArray(source)) {
    const first = source[0];
    if (!first) return null;
    return {
      id: String(first.id),
      storage_url: first.storage_url ?? null,
      metadata:
        first.metadata && typeof first.metadata === "object"
          ? (first.metadata as Record<string, unknown>)
          : null,
    };
  }
  return {
    id: String(source.id),
    storage_url: source.storage_url ?? null,
    metadata:
      source.metadata && typeof source.metadata === "object"
        ? (source.metadata as Record<string, unknown>)
        : null,
  };
}

async function downloadFromStorage(
  supabase: AdminClient,
  path: string,
  mimeTypeHint?: string | null,
): Promise<{ bytes: Uint8Array; mimeType: string; imageUrl: string }> {
  const { data, error } = await supabase.storage.from("source-materials").download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "storage_download_failed");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!isLikelyImageBytes(bytes)) {
    throw new Error("downloaded_not_image");
  }
  return {
    bytes,
    mimeType: mimeForImageContainer(
      sniffImageContainer(bytes),
      mimeTypeHint || data.type || "image/jpeg",
    ),
    imageUrl: path,
  };
}

async function downloadImageBytes(url: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const response = await fetch(url, {
    headers: { Accept: "image/*,application/octet-stream,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`image_download_failed:${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = parseGreenApiDownloadFileBody(
    bytes,
    response.headers.get("content-type") || "",
  );
  const payload = parsed.bytes ?? bytes;
  if (!isLikelyImageBytes(payload)) {
    throw new Error("downloaded_not_image");
  }
  return {
    bytes: payload,
    mimeType: parsed.mimeType || mimeForImageContainer(sniffImageContainer(payload), "image/jpeg"),
  };
}

export async function downloadNotebookImage(params: {
  supabase?: AdminClient;
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials: GreenApiMediaCredentials | null;
  mimeType?: string | null;
}): Promise<{ bytes: Uint8Array; mimeType: string; imageUrl: string }> {
  if (params.supabase && isStorageObjectPath(params.downloadUrl)) {
    return downloadFromStorage(params.supabase, params.downloadUrl!.trim(), params.mimeType);
  }

  const tryHttp = async (url: string) => {
    const downloaded = await downloadImageBytes(url);
    return {
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType || params.mimeType || "image/jpeg",
      imageUrl: url,
    };
  };

  const fromApi = await requestGreenApiDownloadFile({
    chatId: params.chatId,
    messageId: params.messageId,
    credentials: params.credentials,
  });
  if (fromApi?.bytes && isLikelyImageBytes(fromApi.bytes)) {
    return {
      bytes: fromApi.bytes,
      mimeType: mimeForImageContainer(
        sniffImageContainer(fromApi.bytes),
        fromApi.mimeType || params.mimeType || "image/jpeg",
      ),
      imageUrl: fromApi.downloadUrl || params.downloadUrl || "",
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

  throw lastError instanceof Error ? lastError : new Error("image_url_missing");
}

export async function insertPendingWhatsAppImageItem(
  supabase: AdminClient,
  userId: string,
  message: ParsedGreenApiMessage,
): Promise<ImageItemRow> {
  const existing = await findVoiceItemByWhatsAppMessage(supabase, userId, message.messageId);
  if (existing) return existing;
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "image",
      raw_text: "",
      storage_url: message.imageUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
        caption: message.caption ?? message.text ?? null,
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
      title: OCR_PENDING_TITLE,
      content: "",
      is_actionable: false,
      status: "inbox",
      tags: [],
      due_date: null,
      metadata: {
        source: "image",
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
    title: String(inserted.title ?? OCR_PENDING_TITLE),
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

export async function applyImageOcr(
  supabase: AdminClient,
  row: ImageItemRow,
  transcribed: {
    title?: string;
    content?: string;
    correctedText?: string;
    rawText?: string;
    engine?: string;
  },
): Promise<void> {
  const source = firstSourceMaterial(row);
  const body = notebookBodyFromOcr(transcribed);
  if (!body.content) {
    throw new Error("empty_ocr");
  }
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
    parsed = parseInboundText(body.content, {
      sourceType: "notebook_ocr",
      fallbackTitle: body.title,
    })[0];
  } catch (error) {
    console.error("image inbound parse failed, falling back", error);
  }
  if (!parsed && row.user_id) {
    try {
      const allowedTags = await loadAllowedTagNames(supabase, row.user_id);
      const fallback = parseIncomingMessage(body.content, allowedTags)[0];
      if (fallback) {
        parsed = { ...fallback, analysis: undefined };
      }
    } catch (error) {
      console.error("image inbound keyword parse failed, using raw OCR", error);
    }
  }
  const metadata = {
    ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
    source: "image",
    raw_transcription: body.rawText,
    corrected_transcription: body.content,
    ...(transcribed.engine ? { vision_engine: transcribed.engine } : {}),
  };
  const { error: itemError } = await supabase
    .from("mindtasker_items")
    .update({
      title: parsed?.title || body.title,
      content: parsed?.content ?? body.content,
      is_actionable: parsed?.is_actionable ?? false,
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
      raw_text: body.rawText,
      metadata: {
        ...(typeof source.metadata === "object" && source.metadata ? source.metadata : {}),
        raw_transcription: body.rawText,
        corrected_transcription: body.content,
        ...(transcribed.engine ? { vision_engine: transcribed.engine } : {}),
      },
    })
    .eq("id", source.id);
}

async function markImageItemUnavailable(
  supabase: AdminClient,
  row: ImageItemRow,
  detail: string,
): Promise<void> {
  await supabase
    .from("mindtasker_items")
    .update({
      title: OCR_UNAVAILABLE_TITLE,
      content: "זיהוי הטקסט מהתמונה נכשל זמנית — אפשר לערוך ידנית.",
      last_interacted_at: new Date().toISOString(),
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
        source: "image",
        vision_error: detail.slice(0, 500),
      },
    })
    .eq("id", row.id);
}

export async function transcribeStoredImageItem(
  supabase: AdminClient,
  row: ImageItemRow,
  gateway: VoiceGatewayCredentials | null,
  message?: ParsedGreenApiMessage,
): Promise<{ title: string; content: string; rawText: string }> {
  if (!isVisionOcrConfigured()) {
    throw new Error("vision_ocr_not_configured");
  }
  const source = firstSourceMaterial(row);
  const downloaded = await downloadNotebookImage({
    supabase,
    downloadUrl: message?.imageUrl ?? source?.storage_url,
    chatId: message?.chatId ?? String(row.metadata?.chat_id ?? ""),
    messageId: message?.messageId ?? String(row.metadata?.whatsapp_message_id ?? ""),
    credentials: gatewayCredentials(gateway),
    mimeType: message?.mimeType,
  });
  const caption =
    message?.caption ??
    message?.text ??
    (typeof source?.metadata?.caption === "string" ? source.metadata.caption : "");
  const transcribed = await transcribeAndProofreadImage({
    bytes: downloaded.bytes,
    mimeType: downloaded.mimeType,
    caption,
  });
  await applyImageOcr(supabase, row, transcribed);
  return {
    title: transcribed.title,
    content: transcribed.correctedText,
    rawText: transcribed.rawText,
  };
}

export async function finishWhatsAppImageItem(
  supabase: AdminClient,
  row: ImageItemRow,
  gateway: VoiceGatewayCredentials | null,
  message?: ParsedGreenApiMessage,
): Promise<{ title: string; content: string } | null> {
  if (!needsOcrTranscription(row.title, row.content)) {
    return { title: row.title, content: row.content };
  }
  try {
    return await transcribeStoredImageItem(supabase, row, gateway, message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("whatsapp image ocr failed", detail);
    await markImageItemUnavailable(supabase, row, detail);
    return null;
  }
}

export function scheduleImageOcr(
  supabase: AdminClient,
  row: ImageItemRow,
  gateway: VoiceGatewayCredentials | null,
  message?: ParsedGreenApiMessage,
): void {
  scheduleBackgroundWork(
    finishWhatsAppImageItem(supabase, row, gateway, message).then(() => undefined),
  );
}

export async function ingestRecordedImage(
  supabase: AdminClient,
  userId: string,
  params: {
    bytes: Uint8Array;
    mimeType: string;
    fileName?: string;
  },
): Promise<{ itemId: string; title: string; content: string; rawText: string }> {
  if (!isVisionOcrConfigured()) {
    throw new Error("vision_ocr_not_configured");
  }
  const transcribed = await transcribeAndProofreadImage({
    bytes: params.bytes,
    mimeType: params.mimeType,
  });
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
      sourceType: "notebook_ocr",
      fallbackTitle: transcribed.title,
    })[0];
  } catch (error) {
    console.error("recorded image inbound parse failed, falling back", error);
  }
  if (!parsed) {
    const allowedTags = await loadAllowedTagNames(supabase, userId);
    const fallback = parseIncomingMessage(transcribed.correctedText, allowedTags)[0];
    if (fallback) {
      parsed = { ...fallback, analysis: undefined };
    }
  }
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "notebook_ocr",
      raw_text: transcribed.rawText,
      storage_url: null,
      metadata: {
        channel: "app",
        filename: params.fileName ?? null,
        raw_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        vision_engine: transcribed.engine,
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
      title: parsed?.title || transcribed.title || titleFromInboundText(transcribed.correctedText),
      content: parsed?.content ?? transcribed.correctedText,
      is_actionable: parsed?.is_actionable ?? false,
      status: "inbox",
      due_date: parsed?.due_date ?? null,
      tags: parsed?.tags ?? [],
      metadata: {
        source: "notebook_ocr",
        raw_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        vision_engine: transcribed.engine,
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
  return {
    itemId: inserted.id as string,
    title: parsed?.title || transcribed.title,
    content: parsed?.content ?? transcribed.correctedText,
    rawText: transcribed.rawText,
  };
}
