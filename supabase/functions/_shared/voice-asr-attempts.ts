/**
 * Per-item ASR attempt cap for stored WhatsApp voice items.
 * Catch-up runs on many webhooks; without a cap, one broken audio file
 * would be sent to ASR again and again and stay "ממתין לתמלול" forever.
 */

export const VOICE_ASR_MAX_ATTEMPTS = 3;
export const VOICE_ASR_ATTEMPTS_KEY = "voice_asr_attempts";
export const VOICE_ASR_FINAL_STATUS = "failed_final";

type Metadata = Record<string, unknown> | null | undefined;

export function voiceAsrAttempts(metadata: Metadata): number {
  const raw = metadata?.[VOICE_ASR_ATTEMPTS_KEY];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function voiceAsrAttemptsExhausted(
  metadata: Metadata,
  max = VOICE_ASR_MAX_ATTEMPTS,
): boolean {
  return voiceAsrAttempts(metadata) >= max;
}

/** Metadata to persist right before an ASR attempt (counts timeouts too). */
export function withVoiceAsrAttempt(metadata: Metadata, now = new Date()): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [VOICE_ASR_ATTEMPTS_KEY]: voiceAsrAttempts(metadata) + 1,
    voice_asr_last_attempt_at: now.toISOString(),
  };
}

/** Short, secret-free error label for metadata. */
export function voiceAsrErrorLabel(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[A-Za-z0-9_-]{32,}/g, "<redacted>")
    .slice(0, 160);
}

export function voiceAsrFinalMetadata(metadata: Metadata, error: unknown): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    voice_transcription_status: VOICE_ASR_FINAL_STATUS,
    voice_asr_last_error: voiceAsrErrorLabel(error),
    voice_transcribe_started_at: null,
    voice_refine_pending: false,
  };
}
