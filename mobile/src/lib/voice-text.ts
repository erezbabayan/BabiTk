const VOICE_PLACEHOLDERS = ["הודעה קולית מוואטסאפ", "הודעה קולית"] as const;
const VOICE_PENDING = ["ממתין לתמלול", "מתמלל…"] as const;

export const VOICE_TRANSCRIBING_TITLE = "מתמלל…";
export const VOICE_UNAVAILABLE_TITLE = "לא ניתן לתמלל כרגע";

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isPlaceholder(value: string): boolean {
  if (!value) return false;
  return VOICE_PLACEHOLDERS.some(
    (placeholder) => value === placeholder || value.startsWith(placeholder),
  );
}

function isPending(value: string): boolean {
  return VOICE_PENDING.some((label) => value === label);
}

export function needsVoiceTranscription(title: string, content: string): boolean {
  return (
    isPlaceholder(title) ||
    isPlaceholder(content) ||
    isPending(title) ||
    isPending(content)
  );
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type VoiceDisplaySource = {
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source_materials?:
    | {
        storage_url?: string | null;
        raw_text?: string | null;
      }
    | Array<{
        storage_url?: string | null;
        raw_text?: string | null;
      } | null>
    | null;
};

function sourceMaterial(item: VoiceDisplaySource) {
  const source = item.source_materials;
  if (Array.isArray(source)) return source[0] ?? null;
  return source ?? null;
}

function storedTranscript(item: VoiceDisplaySource): string {
  const metadata = item.metadata ?? {};
  const material = sourceMaterial(item);
  const candidates = [
    stringField(metadata.corrected_transcription),
    stringField(metadata.whisper_transcription),
    material?.raw_text?.trim() ?? "",
  ];
  return (
    candidates.find((text) => text && !needsVoiceTranscription(text, text)) ?? ""
  );
}

function hasVoiceAudio(item: VoiceDisplaySource): boolean {
  if (sourceMaterial(item)?.storage_url?.trim()) return true;
  const metadata = item.metadata ?? {};
  return Boolean(
    stringField(metadata.whatsapp_message_id) || stringField(metadata.voice_storage_path),
  );
}

function titleFromText(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? text;
  return firstLine.trim().slice(0, 120);
}

/** Same headline rule as the web board while ASR is still running. */
export function resolveVoiceDisplayText(item: VoiceDisplaySource): {
  title: string;
  content: string;
} {
  const title = normalized(item.title);
  const content = normalized(item.content);
  if (!needsVoiceTranscription(title, content)) {
    return { title, content };
  }
  const stored = storedTranscript(item);
  if (stored) {
    return { title: titleFromText(stored), content: stored };
  }
  if (hasVoiceAudio(item)) {
    return { title: VOICE_TRANSCRIBING_TITLE, content: "" };
  }
  return { title: VOICE_UNAVAILABLE_TITLE, content: "" };
}
