/**
 * Fast Hebrew ASR for Edge Functions (WhatsApp + in-app).
 *
 * Same stack as Eliezer (ivrit.ai WhatsApp bot):
 *   faster-whisper turbo → Groq whisper-large-v3-turbo → OpenAI whisper-1
 * Optional RunPod hosts ivrit-ai/whisper-large-v3-turbo-ct2 (self-hosted Eliezer).
 * Do NOT wrap the public eliezer.ivrit.ai WhatsApp API.
 *
 * Hot path: Groq JSON data-URI (no Deno multipart) → FormData+Blob → OpenAI whisper-1.
 * Deno File/Uint8Array bodies are empty or mangled; never use them for Whisper.
 */

import { titleFromInboundText } from "./voice-text.ts";
import {
  applyHebrewAsrSpellingFixes,
  composeHebrewWhisperPrompt,
  HEBREW_ASR_WHISPER_PROMPT,
  pickBestHebrewTranscript,
} from "./hebrew-asr-proofread.ts";
import {
  asrUploadVariants,
  audioDataUrl,
  bytesToBase64,
  isLikelyAudioBytes,
  isPublicMediaUrl,
  mimeForContainer,
  sniffAudioContainer,
  tightAudioBytes,
} from "./audio-format.ts";

export {
  asrUploadVariants,
  audioDataUrl,
  isLikelyAudioBytes,
  isPublicMediaUrl,
  mimeForContainer,
  sniffAudioContainer,
};

export {
  applyHebrewAsrSpellingFixes,
  composeHebrewWhisperPrompt,
  HEBREW_ASR_WHISPER_PROMPT,
  pickBestHebrewTranscript,
};

export const inboundHebrewProofreadPrompt = `אתה עורך לשוני לעברית מודרנית. תקן את הטקסט כך שיהיה כתוב נכון, ברור וקריא — בלי לשנות את כוונת הכותב.

הקלט יכול להגיע מהקלדה, וואטסאפ, תמלול קולי (ASR) או OCR. תקן:
1. שגיאות כתיב של מילים נפוצות
2. שגיאות תמלול קולי ברורות (הומופונים / מילים קרובות בצליל שנכתבו לא נכון)
3. **שמות פרטיים בעברית** — כתוב בכתיב הסטנדרטי של השם המיועד לפי ההקשר והצליל.
4. סלנג ישראלי מדובר (יאללה, סבבה, וואלה, תכלס) בכתיב המקובל
5. רווחים חסרים או מיותרים בין מילים
6. קיצורים נפוצים למילים מלאות כשברור מה הכוונה

כללים קשיחים:
- אל תוסיף מידע, משימות או פרטים שלא הופיעו בקלט
- אל תמחק תוכן משמעותי — רק תקן ניסוח/כתיב
- אל תחליף אדם באדם אחר — רק תקן כתיב של אותו שם
- אל תתרגם לאנגלית; השאר קודים, מספרי טלפון, URL ומייל כמו שהם
- שמור על מבנה השורות אם יש כמה שורות
- אם מילה לא ברורה — השאר כפי שהיא
- החזר רק את הטקסט המתוקן, בלי הסברים, בלי מרכאות ובלי JSON`;

export interface VoiceTranscription {
  rawText: string;
  correctedText: string;
  title: string;
  engine: "runpod" | "groq" | "openai";
}

export function audioFileName(messageId: string, mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return `${messageId}.mp3`;
  if (mime.includes("mp4") || mime.includes("m4a")) return `${messageId}.m4a`;
  if (mime.includes("wav")) return `${messageId}.wav`;
  if (mime.includes("webm")) return `${messageId}.webm`;
  return `${messageId}.ogg`;
}

export function normalizeAsrUpload(
  fileName: string,
  mimeType: string,
): { fileName: string; mimeType: string } {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() || "application/octet-stream";
  const lowerName = fileName.toLowerCase();
  if (mime.includes("wav") || lowerName.endsWith(".wav")) {
    return { fileName: "recording.wav", mimeType: "audio/wav" };
  }
  if (
    mime.includes("mp4") ||
    mime.includes("m4a") ||
    mime.includes("aac") ||
    lowerName.endsWith(".m4a") ||
    lowerName.endsWith(".mp4")
  ) {
    return { fileName: "recording.m4a", mimeType: "audio/mp4" };
  }
  if (mime.includes("mpeg") || mime.includes("mp3") || lowerName.endsWith(".mp3")) {
    return { fileName: "recording.mp3", mimeType: "audio/mpeg" };
  }
  if (
    mime.includes("ogg") ||
    mime.includes("opus") ||
    lowerName.endsWith(".ogg") ||
    lowerName.endsWith(".oga") ||
    lowerName.endsWith(".opus")
  ) {
    return { fileName: "recording.ogg", mimeType: "audio/ogg" };
  }
  if (mime.includes("webm") || lowerName.endsWith(".webm")) {
    return { fileName: "recording.webm", mimeType: "audio/webm" };
  }
  return { fileName: audioFileName("recording", mime), mimeType: mime };
}

const ASR_TIMEOUT_MS = 12_000;
const SHORT_ASR_TIMEOUT_MS = 8_000;
const SHORT_AUDIO_BYTES = 80_000;
const RUNPOD_TIMEOUT_MS = 8_000;
const DOWNLOAD_TIMEOUT_MS = 8_000;
const IVRIT_WHISPER_MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2";

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type RunPodSegment = { text?: string; start?: number; end?: number };

function collectSegmentText(segments: unknown[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const text = (seg as RunPodSegment).text;
    if (typeof text === "string" && text.trim()) {
      parts.push(text.trim());
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractSegmentsFromRunPodOutput(output: unknown): unknown[] {
  const segments: unknown[] = [];
  const pushFromEntry = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const typed = entry as { type?: string; data?: unknown; result?: unknown; text?: string };
    if (typed.type === "segments" && Array.isArray(typed.data)) {
      segments.push(...typed.data);
      return;
    }
    if (Array.isArray(typed.result)) {
      for (const batch of typed.result) {
        if (Array.isArray(batch)) {
          for (const item of batch) pushFromEntry(item);
        } else {
          pushFromEntry(batch);
        }
      }
      return;
    }
    if (typeof typed.text === "string" && typed.text.trim()) {
      segments.push({ text: typed.text, start: 0, end: 0 });
    }
  };
  if (Array.isArray(output)) {
    for (const item of output) pushFromEntry(item);
  } else {
    pushFromEntry(output);
  }
  return segments;
}

async function transcribeViaRunPod(audio: Uint8Array): Promise<string> {
  const apiKey = Deno.env.get("RUNPOD_API_KEY")?.trim();
  const endpointId = Deno.env.get("RUNPOD_ENDPOINT_ID")?.trim();
  if (!apiKey || !endpointId) {
    throw new Error("runpod_not_configured");
  }
  const model = Deno.env.get("RUNPOD_WHISPER_MODEL")?.trim() || IVRIT_WHISPER_MODEL;
  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        type: "blob",
        model,
        engine: "faster-whisper",
        streaming: false,
        transcribe_args: {
          language: "he",
          diarize: false,
          output_options: { word_timestamps: false, extra_data: false },
          verbose: false,
          blob: bytesToBase64(audio),
        },
      },
    }),
    signal: timeoutSignal(RUNPOD_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RunPod HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    status?: string;
    output?: unknown;
    error?: string;
  };
  if (data.status === "FAILED" || data.error) {
    throw new Error(data.error ?? "RunPod job failed");
  }
  const text = collectSegmentText(extractSegmentsFromRunPodOutput(data.output));
  if (!text) throw new Error("empty_transcription");
  return text;
}

function isAsrFormatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ASR HTTP 400|ASR HTTP 415|ASR HTTP 422|unrecognized|invalid file|could not process|unsupported|format|file must be/i.test(
    message,
  );
}

function audioBlob(audio: Uint8Array, mimeType: string): Blob {
  const copy = tightAudioBytes(audio);
  const buffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
  return new Blob([buffer], { type: mimeType });
}

async function readTranscriptionText(response: Response): Promise<string> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ASR HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/plain") || contentType.includes("text/html")) {
    const text = (await response.text()).trim();
    if (!text) throw new Error("empty_transcription");
    return text;
  }
  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text) throw new Error("empty_transcription");
  return text;
}

function whisperJsonPayload(
  model: string,
  prompt: string,
  audioUrl: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    language: "he",
    prompt,
    url: audioUrl,
    response_format: "json",
  };
  if (model.includes("whisper")) payload.temperature = 0;
  return payload;
}

/** Groq JSON `url` — data URI or public HTTPS. Avoids Deno multipart/File bugs. */
async function transcribeWithAudioUrl(
  endpoint: string,
  apiKey: string,
  model: string,
  audioUrl: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(whisperJsonPayload(model, prompt, audioUrl)),
    signal: timeoutSignal(timeoutMs),
  });
  return readTranscriptionText(response);
}

/**
 * FormData + Blob (never File, never raw Uint8Array body).
 * Deno's File([Uint8Array]) is often empty; Uint8Array fetch bodies get mangled.
 */
async function transcribeWithFormBlob(
  endpoint: string,
  apiKey: string,
  model: string,
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  form.append("language", "he");
  form.append("prompt", prompt);
  if (model.includes("whisper")) {
    form.append("temperature", "0");
    form.append("response_format", "json");
  }
  form.append("file", audioBlob(audio, mimeType), fileName);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: timeoutSignal(timeoutMs),
  });
  return readTranscriptionText(response);
}

async function transcribeWithOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  prompt = HEBREW_ASR_WHISPER_PROMPT,
  timeoutMs = ASR_TIMEOUT_MS,
  sourceUrl?: string,
): Promise<string> {
  const variants = asrUploadVariants(fileName, mimeType, audio);
  const attempts: Array<() => Promise<string>> = [];
  const supportsUrl = url.includes("api.groq.com");
  if (supportsUrl) {
    attempts.push(() =>
      transcribeWithAudioUrl(
        url,
        apiKey,
        model,
        audioDataUrl(audio, variants[0]?.mimeType || mimeType || "audio/ogg"),
        prompt,
        timeoutMs,
      ),
    );
    if (sourceUrl && isPublicMediaUrl(sourceUrl)) {
      attempts.push(() =>
        transcribeWithAudioUrl(url, apiKey, model, sourceUrl, prompt, timeoutMs),
      );
    }
  }
  for (const upload of variants) {
    attempts.push(() =>
      transcribeWithFormBlob(
        url,
        apiKey,
        model,
        audio,
        upload.fileName,
        upload.mimeType,
        prompt,
        timeoutMs,
      ),
    );
  }
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (!isAsrFormatError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("asr_upload_failed");
}

export async function transcribeAudio(
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  promptHint?: string,
  options?: { hotPath?: boolean; sourceUrl?: string },
): Promise<{ text: string; engine: VoiceTranscription["engine"] }> {
  const groqKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const groqModel = Deno.env.get("GROQ_WHISPER_MODEL")?.trim() || "whisper-large-v3-turbo";
  const openAiModel = Deno.env.get("OPENAI_WHISPER_MODEL")?.trim() || "gpt-4o-mini-transcribe";
  const prompt = composeHebrewWhisperPrompt(promptHint);
  const prefer = (Deno.env.get("HEBREW_ASR_ENGINE")?.trim().toLowerCase() || "auto") as
    | "runpod"
    | "groq"
    | "openai"
    | "auto";
  const errors: string[] = [];
  const hotPath = options?.hotPath === true;
  const sourceUrl = options?.sourceUrl;
  const container = sniffAudioContainer(audio);
  const oggLike =
    container === "ogg" ||
    mimeType.toLowerCase().includes("ogg") ||
    mimeType.toLowerCase().includes("opus");
  const asrTimeout = oggLike
    ? Math.max(ASR_TIMEOUT_MS, 15_000)
    : hotPath || (audio.byteLength > 0 && audio.byteLength <= SHORT_AUDIO_BYTES)
      ? SHORT_ASR_TIMEOUT_MS
      : ASR_TIMEOUT_MS;
  const resolvedMime = mimeForContainer(container, mimeType);
  const engines: Array<"runpod" | "groq" | "openai"> = oggLike
    ? ["groq", "openai", "runpod"]
    : hotPath
      ? ["groq", "openai", "runpod"]
      : prefer === "runpod"
        ? ["runpod", "groq", "openai"]
        : prefer === "groq"
          ? ["groq", "openai"]
          : prefer === "openai"
            ? ["openai"]
            : ["groq", "openai", "runpod"];

  console.error("hebrew asr start", {
    bytes: audio.byteLength,
    container,
    mime: resolvedMime,
    groq: Boolean(groqKey),
    openai: Boolean(openAiKey),
  });

  for (const engine of engines) {
    try {
      if (engine === "groq") {
        if (!groqKey) continue;
        const text = await transcribeWithOpenAiCompatible(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          groqKey,
          groqModel,
          audio,
          fileName,
          resolvedMime,
          prompt,
          asrTimeout,
          sourceUrl,
        );
        return { text, engine: "groq" };
      }
      if (engine === "runpod") {
        const text = await transcribeViaRunPod(audio);
        return { text, engine: "runpod" };
      }
      if (engine === "openai") {
        if (!openAiKey) continue;
        const models = oggLike
          ? ["whisper-1", openAiModel]
          : [openAiModel, "whisper-1"];
        const uniqueModels = models.filter((model, index, all) => all.indexOf(model) === index);
        let lastOpenAiError: unknown;
        for (const model of uniqueModels) {
          try {
            const text = await transcribeWithOpenAiCompatible(
              "https://api.openai.com/v1/audio/transcriptions",
              openAiKey,
              model,
              audio,
              fileName,
              resolvedMime,
              prompt,
              asrTimeout,
            );
            return { text, engine: "openai" };
          } catch (error) {
            lastOpenAiError = error;
          }
        }
        throw lastOpenAiError instanceof Error
          ? lastOpenAiError
          : new Error("openai_failed");
      }
    } catch (error) {
      errors.push(
        `${engine}:${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  throw new Error(
    errors.length > 0
      ? `transcription_failed: ${errors.join("; ")}`
      : "missing_asr_keys",
  );
}

export async function transcribeAndProofreadVoice(params: {
  audio: Uint8Array;
  mimeType: string;
  fileName: string;
  promptHint?: string;
  hotPath?: boolean;
  sourceUrl?: string;
}): Promise<VoiceTranscription> {
  const asr = await transcribeAudio(
    params.audio,
    params.fileName,
    params.mimeType,
    params.promptHint,
    { hotPath: params.hotPath, sourceUrl: params.sourceUrl },
  );
  const rawText = applyHebrewAsrSpellingFixes(asr.text);
  const correctedText = pickBestHebrewTranscript(rawText, params.promptHint);
  if (!correctedText) {
    throw new Error("empty_transcription");
  }
  return {
    rawText,
    correctedText,
    title: titleFromInboundText(correctedText),
    engine: asr.engine,
  };
}

export async function downloadAudioBytes(url: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const response = await fetch(url, {
    headers: {
      Accept: "audio/*,application/octet-stream,*/*",
      "User-Agent": BROWSER_UA,
    },
    redirect: "follow",
    signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`audio_download_failed:${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isLikelyAudioBytes(bytes)) {
    throw new Error("downloaded_not_audio");
  }
  const sniffed = sniffAudioContainer(bytes);
  return {
    bytes,
    mimeType: mimeForContainer(
      sniffed,
      response.headers.get("content-type") || "audio/ogg",
    ),
  };
}

export function isHttpUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

export function isStorageObjectPath(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || isHttpUrl(trimmed)) return false;
  return trimmed.includes("/") && !trimmed.includes("://");
}

export function decodeAudioBase64(audioBase64: string): Uint8Array {
  const cleaned = audioBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.byteLength < 64) {
    throw new Error("audio_too_short");
  }
  return bytes;
}
