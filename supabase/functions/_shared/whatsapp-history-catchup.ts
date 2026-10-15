/**
 * Recover WhatsApp voice notes that Green-API never delivered as
 * outgoingMessageReceived (common for phone PTT) or that timed out mid-ASR.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  findVoiceItemByWhatsAppMessage,
  insertPendingWhatsAppVoiceItem,
  scheduleBackgroundWork,
  transcribeStoredVoiceItem,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "./voice-ingest.ts";
import { needsVoiceTranscription } from "./voice-text.ts";
import { historyAudioMessage, type ParsedGreenApiMessage } from "./green-api.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface CatchupGateway extends VoiceGatewayCredentials {
  user_id?: string;
}

export interface CatchupResult {
  inserted: number;
  transcribed: number;
  pending: number;
}

interface HistoryAudioRow {
  idMessage?: string;
  typeMessage?: string;
  type?: string;
  downloadUrl?: string;
  mimeType?: string;
  fileName?: string;
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

async function fetchHistoryAudio(
  gateway: CatchupGateway,
  captureChatId: string,
  count: number,
): Promise<ParsedGreenApiMessage[]> {
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
  const messages: ParsedGreenApiMessage[] = [];
  for (const row of hist) {
    if (!row || typeof row !== "object") continue;
    const message = historyAudioMessage(captureChatId, row as HistoryAudioRow);
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
}): Promise<CatchupResult> {
  const result: CatchupResult = { inserted: 0, transcribed: 0, pending: 0 };
  const capture = await loadCaptureChatId(options.supabase, options.userId);
  if (!capture) return result;

  const messages = await fetchHistoryAudio(
    options.gateway,
    capture,
    options.count ?? 15,
  );
  const toTranscribe: VoiceItemRow[] = [];

  for (const message of messages) {
    let row = await findVoiceItemByWhatsAppMessage(
      options.supabase,
      options.userId,
      message.messageId,
    );
    if (!row) {
      row = await insertPendingWhatsAppVoiceItem(
        options.supabase,
        options.userId,
        message,
      );
      result.inserted += 1;
    }
    if (needsVoiceTranscription(row.title, row.content)) {
      result.pending += 1;
      toTranscribe.push(row);
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
