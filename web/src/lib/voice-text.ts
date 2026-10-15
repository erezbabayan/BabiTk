/**
 * Voice-capture display text. Keep in sync with
 * supabase/functions/_shared/voice-text.ts and backend/src/lib/ingest/voice-text.ts
 */

import type { MindtaskerItem } from "../types";

export const WHATSAPP_VOICE_PLACEHOLDERS = [
  "הודעה קולית מוואטסאפ",
  "הודעה קולית",
] as const;

export const VOICE_PENDING_TITLE = "ממתין לתמלול";
export const VOICE_TRANSCRIBING_TITLE = "מתמלל…";
export const VOICE_UNAVAILABLE_TITLE = "לא ניתן לתמלל כרגע";
export const OCR_PENDING_TITLE = "ממתין לסריקה";
export const OCR_UNAVAILABLE_TITLE = "לא ניתן לסרוק כרגע";

const VOICE_PENDING_TITLES = [VOICE_PENDING_TITLE, VOICE_TRANSCRIBING_TITLE] as const;

export function isVoicePlaceholderText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return WHATSAPP_VOICE_PLACEHOLDERS.some(
    (placeholder) => normalized === placeholder || normalized.startsWith(placeholder),
  );
}

export function isVoicePendingText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return VOICE_PENDING_TITLES.some((label) => normalized === label);
}

export function needsVoiceTranscription(
  title: string | null | undefined,
  content: string | null | undefined,
): boolean {
  return (
    isVoicePlaceholderText(title) ||
    isVoicePlaceholderText(content) ||
    isVoicePendingText(title) ||
    isVoicePendingText(content)
  );
}

export const GENERIC_INBOUND_PLACEHOLDERS = [
  "פריט מוואטסאפ",
  "תמונה מוואטסאפ",
] as const;

export function isGenericInboundPlaceholder(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return (GENERIC_INBOUND_PLACEHOLDERS as readonly string[]).includes(normalized);
}

const OCR_PENDING_TITLES = [OCR_PENDING_TITLE] as const;
const OCR_FAILED_TITLES = [OCR_UNAVAILABLE_TITLE, "לא ניתן לסרוק"] as const;

export function isOcrPendingText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return OCR_PENDING_TITLES.some((label) => normalized === label);
}

function isOcrFailedText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  if (OCR_FAILED_TITLES.some((label) => normalized === label || normalized.startsWith(label))) {
    return true;
  }
  return normalized.includes("זיהוי הטקסט מהתמונה נכשל");
}

export function needsOcrTranscription(
  title: string | null | undefined,
  content: string | null | undefined,
): boolean {
  const imageStub = (value: string | null | undefined) =>
    (value?.trim() ?? "") === "תמונה מוואטסאפ";
  return (
    isOcrPendingText(title) ||
    isOcrPendingText(content) ||
    isOcrFailedText(title) ||
    isOcrFailedText(content) ||
    imageStub(title) ||
    imageStub(content)
  );
}

/** Real prose only — never a voice/image stub — before a board row is created. */
export function isInsertableInboundText(title: string, content: string): boolean {
  const body = content.trim() || title.trim();
  if (!body) return false;
  if (needsVoiceTranscription(title, content)) return false;
  if (isGenericInboundPlaceholder(title) || isGenericInboundPlaceholder(content)) return false;
  if (needsOcrTranscription(title, content)) return false;
  return true;
}

export function titleFromInboundText(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? trimmed;
  return firstLine.trim().slice(0, 120);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadataTranscription(item: Pick<MindtaskerItem, "metadata" | "source_materials">): string {
  const metadata = item.metadata ?? {};
  const candidates = [
    stringField(metadata.corrected_transcription),
    stringField(metadata.whisper_transcription),
    item.source_materials?.raw_text?.trim() ?? "",
  ];
  return candidates.find((text) => text && !needsVoiceTranscription(text, text)) ?? "";
}

export function hasVoiceAudioSource(item: Pick<MindtaskerItem, "metadata" | "source_materials">): boolean {
  if (item.source_materials?.storage_url?.trim()) return true;
  const metadata = item.metadata ?? {};
  return Boolean(
    stringField(metadata.whatsapp_message_id) || stringField(metadata.voice_storage_path),
  );
}

export interface VoiceDisplayText {
  title: string;
  content: string;
  transcribing: boolean;
}

/**
 * Never surface the WhatsApp voice placeholder. Prefer a stored transcript,
 * otherwise a short in-progress label while ASR runs.
 */
export function resolveVoiceDisplayText(
  item: Pick<MindtaskerItem, "title" | "content" | "metadata" | "source_materials">,
): VoiceDisplayText {
  const title = item.title.trim();
  const content = item.content.trim();
  if (!needsVoiceTranscription(title, content)) {
    return { title: title || content || "ללא שם", content, transcribing: false };
  }

  const stored = metadataTranscription(item);
  if (stored) {
    return {
      title: titleFromInboundText(stored),
      content: stored,
      transcribing: false,
    };
  }

  if (hasVoiceAudioSource(item)) {
    return { title: VOICE_TRANSCRIBING_TITLE, content: "", transcribing: true };
  }

  return { title: VOICE_UNAVAILABLE_TITLE, content: "", transcribing: false };
}

export function itemNeedsVoiceRepair(
  item: Pick<MindtaskerItem, "title" | "content" | "metadata" | "source_materials">,
): boolean {
  return needsVoiceTranscription(item.title, item.content) && hasVoiceAudioSource(item);
}
