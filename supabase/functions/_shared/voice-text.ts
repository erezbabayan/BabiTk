/**
 * Voice-capture display text. Keep in sync with backend/src/lib/ingest/voice-text.ts
 */

export const WHATSAPP_VOICE_PLACEHOLDERS = [
  "הודעה קולית מוואטסאפ",
  "הודעה קולית",
] as const;

export function isVoicePlaceholderText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return WHATSAPP_VOICE_PLACEHOLDERS.some(
    (placeholder) => normalized === placeholder || normalized.startsWith(placeholder),
  );
}

export function titleFromInboundText(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? trimmed;
  return firstLine.trim().slice(0, 120);
}
