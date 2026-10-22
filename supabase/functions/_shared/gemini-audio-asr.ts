import { bytesToBase64 } from "./audio-format.ts";
import { readRuntimeEnv } from "./runtime-env.ts";

/** Free-tier Gemini models that accept inline audio (reuses the existing GEMINI_API_KEY). */
export const GEMINI_AUDIO_MODELS = ["gemini-flash-latest", "gemini-3.1-flash-lite"] as const;
export const GEMINI_AUDIO_TIMEOUT_MS = 10_000;
/** Inline request limit is ~20 MB; stay well below it. */
const GEMINI_AUDIO_MAX_BYTES = 12 * 1024 * 1024;

const PROMPT =
  "תמלל את ההקלטה בעברית מילה במילה. החזר רק את התמלול, בלי הסברים, בלי כותרות ובלי מירכאות. אם אין דיבור — החזר מחרוזת ריקה.";

export function geminiAudioText(payload: unknown): string {
  const record = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  } | null;
  const parts = record?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export function geminiAudioMime(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime.includes("wav")) return "audio/wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio/mp3";
  if (mime.includes("ogg") || mime.includes("opus")) return "audio/ogg";
  if (mime.includes("aac")) return "audio/aac";
  if (mime.includes("webm")) return "audio/webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "audio/mp4";
  return mime || "audio/mp4";
}

export function isGeminiAudioConfigured(): boolean {
  return Boolean(readRuntimeEnv("GEMINI_API_KEY"));
}

export async function transcribeViaGeminiAudio(
  audio: Uint8Array,
  mimeType: string,
  timeoutMs = GEMINI_AUDIO_TIMEOUT_MS,
): Promise<{ text: string; model: string }> {
  const key = readRuntimeEnv("GEMINI_API_KEY");
  if (!key) throw new Error("gemini_not_configured");
  if (audio.byteLength > GEMINI_AUDIO_MAX_BYTES) throw new Error("gemini_audio_too_large");
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: geminiAudioMime(mimeType), data: bytesToBase64(audio) } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });
  const errors: string[] = [];
  for (const model of GEMINI_AUDIO_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!response.ok) {
        errors.push(`${model}:HTTP ${response.status}`);
        continue;
      }
      const text = geminiAudioText(await response.json().catch(() => null));
      if (text) return { text, model };
      errors.push(`${model}:empty`);
    } catch (error) {
      errors.push(`${model}:${error instanceof Error ? error.name : "failed"}`);
    }
  }
  throw new Error(`gemini_failed: ${errors.join("; ")}`);
}
