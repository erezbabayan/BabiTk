/**
 * Voice-capture display text. Keep in sync with
 * backend/src/lib/ingest/voice-text.ts and web/src/lib/voice-text.ts
 */

import { composeInboundTitle } from "../../../convex/lib/ingest/taskPresentation.ts";

export const WHATSAPP_VOICE_PLACEHOLDERS = [
  "הודעה קולית מוואטסאפ",
  "הודעה קולית",
] as const;

/** Temporary title while ASR runs — never a substitute for a transcript. */
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

/** True when the stored title/content is still waiting for a real transcript. */
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

/** Real prose only — never a voice/image stub — before a board row is created. */
export function isInsertableInboundText(title: string, content: string): boolean {
  const body = content.trim() || title.trim();
  if (!body) return false;
  if (needsVoiceTranscription(title, content)) return false;
  if (isGenericInboundPlaceholder(title) || isGenericInboundPlaceholder(content)) return false;
  return true;
}

export function titleFromInboundText(text: string): string {
  return composeInboundTitle(text);
}
