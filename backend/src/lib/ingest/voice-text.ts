/**
 * Voice-capture display text. WhatsApp audio must become a transcription,
 * never a generic "voice message" placeholder.
 * Keep in sync with supabase/functions/_shared/voice-text.ts and web/src/lib/voice-text.ts
 */

export const WHATSAPP_VOICE_PLACEHOLDERS = [
  "הודעה קולית מוואטסאפ",
  "הודעה קולית",
] as const;

export const VOICE_PENDING_TITLE = "ממתין לתמלול";
export const VOICE_TRANSCRIBING_TITLE = "מתמלל…";
export const VOICE_UNAVAILABLE_TITLE = "לא ניתן לתמלל כרגע";

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

export function titleFromInboundText(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? trimmed;
  return firstLine.trim().slice(0, 120);
}
