/**
 * Fast in-app Hebrew ASR helpers.
 *
 * Other systems (WhatsApp, Apple Dictation, SuperWhisper, Otter) do:
 *  1. On-device / streaming speech for instant captions
 *  2. A hosted turbo Whisper (Groq whisper-large-v3-turbo) for the canonical text
 *  3. A slow public model only as last resort
 *
 * BabiTk persists the inbox row immediately (live caption or «מתמלל…»),
 * then refines with Edge Groq in the background. Gradio is repair-only.
 */

export const FAST_VOICE_ASR_CASCADE = [
  "persist-now",
  "background-edge-groq",
  "repair-gradio",
] as const;

/** Stay under the typical Supabase Edge JSON body limit. */
export const MAX_EDGE_AUDIO_BYTES = 4_500_000;
/** Long enough for Groq + one fallback; the capture UI does not await this. */
export const EDGE_INGEST_TIMEOUT_MS = 25_000;
/** Capture UI must never wait for Groq / OpenAI / Gradio. */
export const AWAIT_EDGE_ON_CAPTURE = false;
export const EDGE_TRANSCRIBE_TIMEOUT_MS = 20_000;

const HEBREW_ASR_WHISPER_PROMPT =
  "עברית מדוברת. משימות יומיום: לקנות, להתקשר, לשלוח, תזכורת, בבקשה, בבי, babi. " +
  "סלנג: יאללה, סבבה, וואלה, תכלס, אחלה, אוקיי. " +
  "זמנים: היום, להיום, מחר, מחרתיים, שבוע הבא, לשבוע הבא, בצהריים, אחה״צ, סופ״ש.";

export function hasHebrewLetters(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function isUsableLiveTranscript(text: string | null | undefined): boolean {
  const trimmed = text?.replace(/\s+/g, " ").trim() ?? "";
  if (trimmed.length < 2) return false;
  if (hasHebrewLetters(trimmed)) return trimmed.length >= 2;
  return trimmed.split(" ").filter(Boolean).length >= 2 && trimmed.length >= 6;
}

export function composeHebrewWhisperPrompt(hint?: string): string {
  const trimmed = hint?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return HEBREW_ASR_WHISPER_PROMPT;
  return `${HEBREW_ASR_WHISPER_PROMPT} ${trimmed.slice(0, 180)}`;
}

export function pickBestHebrewTranscript(primary: string, hint?: string): string {
  const hosted = primary.replace(/\s+/g, " ").trim();
  const live = (hint ?? "").replace(/\s+/g, " ").trim();
  if (!hosted) return live;
  if (!live) return hosted;
  const hostedHebrew = hasHebrewLetters(hosted);
  const liveHebrew = hasHebrewLetters(live);
  if (hostedHebrew && !liveHebrew) return hosted;
  if (liveHebrew && !hostedHebrew) return live;
  if (
    hostedHebrew &&
    liveHebrew &&
    live.length >= hosted.length * 2 &&
    live.length - hosted.length >= 8
  ) {
    return live;
  }
  return hosted;
}

export function canSendAudioToEdge(byteLength: number): boolean {
  return Number.isFinite(byteLength) && byteLength >= 64 && byteLength <= MAX_EDGE_AUDIO_BYTES;
}

/** Whisper/Groq reject `audio/webm;codecs=opus` and odd extensions. */
export function normalizeAsrUpload(
  fileName: string,
  mimeType: string,
): { fileName: string; mimeType: string } {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() || "application/octet-stream";
  const lowerName = fileName.toLowerCase();
  if (mime.includes("wav") || lowerName.endsWith(".wav")) {
    return { fileName: "recording.wav", mimeType: "audio/wav" };
  }
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") || lowerName.endsWith(".m4a") || lowerName.endsWith(".mp4")) {
    return { fileName: "recording.m4a", mimeType: "audio/mp4" };
  }
  if (mime.includes("mpeg") || mime.includes("mp3") || lowerName.endsWith(".mp3")) {
    return { fileName: "recording.mp3", mimeType: "audio/mpeg" };
  }
  if (mime.includes("ogg") || lowerName.endsWith(".ogg") || lowerName.endsWith(".oga")) {
    return { fileName: "recording.ogg", mimeType: "audio/ogg" };
  }
  if (mime.includes("webm") || lowerName.endsWith(".webm")) {
    return { fileName: "recording.webm", mimeType: "audio/webm" };
  }
  return { fileName: "recording.wav", mimeType: "audio/wav" };
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return uint8ToBase64(new Uint8Array(buffer));
}

export interface EdgeVoicePayload {
  ok: boolean;
  itemId: string;
  title: string;
  content: string;
  alreadyTranscribed?: boolean;
  answered?: boolean;
}

export function parseEdgeVoicePayload(
  data: unknown,
  fallbackItemId = "",
): EdgeVoicePayload | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if ("stateInstance" in record || "qrBase64" in record) return null;
  if (typeof record.error === "string" && record.error.length > 0) {
    throw new Error(record.error);
  }
  const title =
    typeof record.title === "string"
      ? record.title.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : "";
  if (!title) return null;
  return {
    ok: record.ok === false ? false : true,
    itemId: typeof record.itemId === "string" ? record.itemId : fallbackItemId,
    title,
    content:
      typeof record.content === "string"
        ? record.content
        : typeof record.text === "string"
          ? record.text
          : title,
    alreadyTranscribed: record.alreadyTranscribed === true,
    answered: record.answered === true,
  };
}

export function joinSpeechRecognitionTranscripts(
  results: Array<{ transcript?: string } | string>,
): string {
  const parts: string[] = [];
  for (const result of results) {
    const text = typeof result === "string" ? result : result.transcript ?? "";
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) parts.push(trimmed);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
