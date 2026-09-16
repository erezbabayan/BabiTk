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
  transcribeAndProofreadVoice,
} from "./hebrew-voice-asr.ts";
import {
  isVoicePlaceholderText,
  needsVoiceTranscription,
  VOICE_PENDING_TITLE,
} from "./voice-text.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface VoiceGatewayCredentials {
  instance_id: string;
  api_token: string;
  api_url: string;
}

export interface VoiceItemRow {
  id: string;
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

async function downloadVoiceAudio(params: {
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials: GreenApiMediaCredentials | null;
  mimeType?: string | null;
}): Promise<{ bytes: Uint8Array; mimeType: string; audioUrl: string }> {
  let audioUrl = await resolveGreenApiMediaUrl({
    downloadUrl: params.downloadUrl,
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

export async function transcribeVoiceMessage(
  message: ParsedGreenApiMessage,
  gateway: VoiceGatewayCredentials | null,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  const downloaded = await downloadVoiceAudio({
    downloadUrl: message.audioUrl,
    chatId: message.chatId,
    messageId: message.messageId,
    credentials: gatewayCredentials(gateway),
    mimeType: message.mimeType,
  });
  const transcribed = await transcribeAndProofreadVoice({
    audio: downloaded.bytes,
    mimeType: downloaded.mimeType,
    fileName: audioFileName(message.messageId, downloaded.mimeType),
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
  },
): Promise<void> {
  const source = firstSourceMaterial(row);
  const metadata = {
    ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
    source: "whatsapp_voice",
    whisper_transcription: transcribed.rawText,
    corrected_transcription: transcribed.content,
    voice_transcribe_started_at: null,
  };
  const { error: itemError } = await supabase
    .from("mindtasker_items")
    .update({
      title: transcribed.title,
      content: transcribed.content,
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

export async function transcribeStoredVoiceItem(
  supabase: AdminClient,
  row: VoiceItemRow,
  gateway: VoiceGatewayCredentials | null,
): Promise<{ title: string; content: string; rawText: string; audioUrl: string | null }> {
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
  const transcribed = await transcribeVoiceMessage(
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
  );
  await applyVoiceTranscription(supabase, row, transcribed);
  return transcribed;
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
      "id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
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
  } catch {
    return false;
  }
}

export async function loadVoiceItemForUser(
  supabase: AdminClient,
  userId: string,
  itemId: string,
): Promise<VoiceItemRow | null> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      "id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
    )
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as VoiceItemRow;
}
