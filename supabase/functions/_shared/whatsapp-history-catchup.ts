/**
 * Recover WhatsApp voice notes that Green-API never delivered as
 * outgoingMessageReceived (common for phone PTT) or that timed out mid-ASR.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  findVoiceItemByWhatsAppMessage,
  insertPendingWhatsAppVoiceItem,
  isSoftDeletedVoiceItem,
  isWhatsAppMessageCaptured,
  scheduleBackgroundWork,
  transcribeStoredVoiceItem,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "./voice-ingest.ts";
import {
  finishWhatsAppImageItem,
  insertPendingWhatsAppImageItem,
} from "./notebook-ingest.ts";
import { needsOcrTranscription, needsVoiceTranscription } from "./voice-text.ts";
import {
  historyAudioMessage,
  historyImageMessage,
  type ParsedGreenApiMessage,
} from "./green-api.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface CatchupGateway extends VoiceGatewayCredentials {
  user_id?: string;
}

export interface CatchupResult {
  inserted: number;
  transcribed: number;
  pending: number;
}

interface HistoryMediaRow {
  idMessage?: string;
  typeMessage?: string;
  type?: string;
  downloadUrl?: string;
  jpegUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  sendByApi?: boolean;
}

async function loadCaptureChatId(
  supabase: AdminClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("users")
    .select("whatsapp_capture_group_chat_id")
    .eq("id", userId)
    .maybeSingle();
  const capture =
    typeof data?.whatsapp_capture_group_chat_id === "string"
      ? data.whatsapp_capture_group_chat_id.trim()
      : "";
  return capture.endsWith("@g.us") || capture.endsWith("@c.us") ? capture : "";
}

async function fetchChatHistory(
  gateway: CatchupGateway,
  captureChatId: string,
  count: number,
): Promise<HistoryMediaRow[]> {
  const base = (gateway.api_url || "https://api.green-api.com").replace(/\/$/, "");
  const url = `${base}/waInstance${gateway.instance_id}/getChatHistory/${gateway.api_token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: captureChatId, count }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const hist: unknown = await response.json().catch(() => null);
  if (!Array.isArray(hist)) return [];
  return hist.filter((row): row is HistoryMediaRow => Boolean(row && typeof row === "object"));
}

function historyAudioMessages(
  captureChatId: string,
  rows: HistoryMediaRow[],
): ParsedGreenApiMessage[] {
  const messages: ParsedGreenApiMessage[] = [];
  for (const row of rows) {
    const message = historyAudioMessage(captureChatId, row);
    if (message) messages.push(message);
  }
  return messages;
}

function historyImageMessages(
  captureChatId: string,
  rows: HistoryMediaRow[],
): ParsedGreenApiMessage[] {
  const messages: ParsedGreenApiMessage[] = [];
  for (const row of rows) {
    const message = historyImageMessage(captureChatId, row);
    if (message) messages.push(message);
  }
  return messages;
}

export async function catchUpCaptureVoice(options: {
  supabase: AdminClient;
  userId: string;
  gateway: CatchupGateway;
  transcribe?: boolean;
  count?: number;
}): Promise<CatchupResult & { imagesInserted: number; imagesTranscribed: number }> {
  const result: CatchupResult & { imagesInserted: number; imagesTranscribed: number } = {
    inserted: 0,
    transcribed: 0,
    pending: 0,
    imagesInserted: 0,
    imagesTranscribed: 0,
  };
  const capture = await loadCaptureChatId(options.supabase, options.userId);
  if (!capture) return result;

  const rows = await fetchChatHistory(
    options.gateway,
    capture,
    options.count ?? 20,
  );
  const messages = historyAudioMessages(capture, rows);
  const images = historyImageMessages(capture, rows);
  const toTranscribe: VoiceItemRow[] = [];
  const toOcr: Array<{ row: VoiceItemRow; message: ParsedGreenApiMessage }> = [];

  for (const message of messages) {
    let row = await findVoiceItemByWhatsAppMessage(
      options.supabase,
      options.userId,
      message.messageId,
    );
    if (row && isSoftDeletedVoiceItem(row)) continue;
    if (
      !row &&
      (await isWhatsAppMessageCaptured(
        options.supabase,
        options.userId,
        message.messageId,
      ))
    ) {
      continue;
    }
    if (!row) {
      row = await insertPendingWhatsAppVoiceItem(
        options.supabase,
        options.userId,
        message,
      );
      result.inserted += 1;
    }
    if (row && isSoftDeletedVoiceItem(row)) continue;
    if (needsVoiceTranscription(row.title, row.content)) {
      result.pending += 1;
      toTranscribe.push(row);
    }
  }

  for (const message of images) {
    let row = await findVoiceItemByWhatsAppMessage(
      options.supabase,
      options.userId,
      message.messageId,
    );
    if (row && isSoftDeletedVoiceItem(row)) continue;
    if (
      !row &&
      (await isWhatsAppMessageCaptured(
        options.supabase,
        options.userId,
        message.messageId,
      ))
    ) {
      continue;
    }
    if (!row) {
      row = await insertPendingWhatsAppImageItem(
        options.supabase,
        options.userId,
        message,
      );
      result.imagesInserted += 1;
    }
    if (row && isSoftDeletedVoiceItem(row)) continue;
    if (needsOcrTranscription(row.title, row.content)) {
      toOcr.push({ row, message });
    }
  }

  if (!options.transcribe) return result;

  for (const row of toTranscribe.slice(0, 6)) {
    try {
      await transcribeStoredVoiceItem(options.supabase, row, options.gateway);
      result.transcribed += 1;
    } catch (error) {
      console.error("catchup voice transcribe failed", error);
    }
  }
  for (const item of toOcr.slice(0, 6)) {
    try {
      const done = await finishWhatsAppImageItem(
        options.supabase,
        item.row,
        options.gateway,
        item.message,
      );
      if (done) result.imagesTranscribed += 1;
    } catch (error) {
      console.error("catchup image ocr failed", error);
    }
  }
  return result;
}

export function scheduleCaptureVoiceCatchup(options: {
  supabase: AdminClient;
  userId: string;
  gateway: CatchupGateway;
}): void {
  scheduleBackgroundWork(
    catchUpCaptureVoice({ ...options, transcribe: true }).then(() => undefined),
  );
}
