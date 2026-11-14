/**
 * Last-resort browser/mobile Hebrew ASR when Groq Edge is unreachable.
 *
 * Uses public Hugging Face Whisper Spaces (cold start, slow). Prefer
 * `ingest-voice` / Groq whisper-large-v3-turbo on the hot path.
 * Deterministic lexicon in hebrewAsrSpelling.ts. Does NOT wrap eliezer.ivrit.ai.
 */

import { applyHebrewAsrSpellingFixes } from "./hebrewAsrSpelling";

function titleFromInboundText(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? trimmed;
  return firstLine.trim().slice(0, 120);
}

export interface PublicVoiceTranscription {
  rawText: string;
  correctedText: string;
  title: string;
  engine: "hf-whisper-large-v3" | "hf-ivrit-whisper";
}

const HF_AUDIO_SPACE = "https://hf-audio-whisper-large-v3.hf.space";
const IVRIT_SPACE = "https://ortalhanuna-speech2text-hebrew.hf.space";
const GRADIO_TIMEOUT_MS = 16_000;
const GRADIO_SPACE_TIMEOUT_MS = 12_000;

const STATUS_LINES = /^(done!?|splitting audio.*|transcribing .*|chunk \d+\/\d+ done)$/i;

export function hasHebrewLetters(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function stripAsrTimestamps(text: string): string {
  return text
    .replace(/^\s*\[[^\]]+]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickTranscriptFromGradioData(data: unknown): string {
  if (typeof data === "string") {
    return stripAsrTimestamps(data);
  }
  if (!Array.isArray(data)) return "";
  const parts: string[] = [];
  for (const item of data) {
    if (typeof item !== "string") continue;
    const trimmed = stripAsrTimestamps(item);
    if (!trimmed || STATUS_LINES.test(trimmed)) continue;
    parts.push(trimmed);
  }
  if (parts.length === 0) return "";
  return parts.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
}

export function parseGradioSseText(sse: string): string {
  const blocks = sse.split(/\n\n+/);
  let latest = "";
  for (const block of blocks) {
    const event = /^\s*event:\s*(\S+)/m.exec(block)?.[1] ?? "";
    const dataLine = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!dataLine || dataLine === "null") continue;
    try {
      const parsed: unknown = JSON.parse(dataLine);
      const text = pickTranscriptFromGradioData(parsed);
      if (text) latest = text;
      if (event === "complete" && text) return text;
    } catch {
      // ignore malformed SSE chunks
    }
  }
  return latest;
}

function fileDataFromUrl(url: string, fileName: string): Record<string, unknown> {
  return {
    path: url,
    url,
    orig_name: fileName,
    meta: { _type: "gradio.FileData" },
  };
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("transcription_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function gradioUpload(space: string, blob: Blob, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("files", blob, fileName);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`gradio_upload_${response.status}`);
  }
  const body: unknown = await response.json();
  const path = Array.isArray(body) && typeof body[0] === "string" ? body[0] : "";
  if (!path) throw new Error("gradio_upload_empty");
  return path;
}

async function gradioCall(
  space: string,
  apiName: string,
  data: unknown[],
): Promise<string> {
  const started = await fetch(`${space}/gradio_api/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!started.ok) {
    throw new Error(`gradio_call_${started.status}`);
  }
  const startedJson: unknown = await started.json();
  const eventId =
    startedJson &&
    typeof startedJson === "object" &&
    "event_id" in startedJson &&
    typeof (startedJson as { event_id: unknown }).event_id === "string"
      ? (startedJson as { event_id: string }).event_id
      : "";
  if (!eventId) throw new Error("gradio_event_missing");
  const stream = await fetch(`${space}/gradio_api/call/${apiName}/${eventId}`);
  if (!stream.ok) {
    throw new Error(`gradio_stream_${stream.status}`);
  }
  const sse = await stream.text();
  const text = parseGradioSseText(sse);
  if (!text) throw new Error("empty_transcription");
  return text;
}

async function transcribeWithHfAudio(file: Record<string, unknown> | string): Promise<string> {
  const payload = typeof file === "string" ? fileDataFromUrl(file, "voice.ogg") : file;
  return gradioCall(HF_AUDIO_SPACE, "transcribe", [payload, "transcribe"]);
}

async function transcribeWithIvritSpace(file: Record<string, unknown> | string): Promise<string> {
  const payload = typeof file === "string" ? fileDataFromUrl(file, "voice.ogg") : file;
  return gradioCall(IVRIT_SPACE, "run_transcription", [payload]);
}

function toResult(raw: string, engine: PublicVoiceTranscription["engine"]): PublicVoiceTranscription {
  const rawText = applyHebrewAsrSpellingFixes(raw);
  const correctedText = applyHebrewAsrSpellingFixes(rawText.trim());
  if (!correctedText) {
    throw new Error("empty_transcription");
  }
  return {
    rawText,
    correctedText,
    title: titleFromInboundText(correctedText),
    engine,
  };
}

export async function transcribeHebrewAudioUrl(audioUrl: string): Promise<PublicVoiceTranscription> {
  const url = audioUrl.trim();
  if (!url) throw new Error("voice_audio_url_missing");
  return withTimeout(
    (async () => {
      try {
        const text = await withTimeout(transcribeWithHfAudio(url), GRADIO_SPACE_TIMEOUT_MS);
        if (hasHebrewLetters(text) || text.split(/\s+/).length >= 2) {
          return toResult(text, "hf-whisper-large-v3");
        }
      } catch {
        // fall through to the Hebrew-tuned space
      }
      const hebrew = await withTimeout(transcribeWithIvritSpace(url), GRADIO_SPACE_TIMEOUT_MS);
      return toResult(hebrew, "hf-ivrit-whisper");
    })(),
    GRADIO_TIMEOUT_MS,
  );
}

export async function transcribeHebrewAudioBlob(
  blob: Blob,
  fileName = "recording.webm",
): Promise<PublicVoiceTranscription> {
  if (blob.size < 64) throw new Error("audio_too_short");
  return withTimeout(
    (async () => {
      try {
        const uploaded = await withTimeout(
          gradioUpload(HF_AUDIO_SPACE, blob, fileName),
          GRADIO_SPACE_TIMEOUT_MS,
        );
        const text = await withTimeout(
          transcribeWithHfAudio({
            path: uploaded,
            orig_name: fileName,
            meta: { _type: "gradio.FileData" },
          }),
          GRADIO_SPACE_TIMEOUT_MS,
        );
        if (hasHebrewLetters(text) || text.split(/\s+/).length >= 2) {
          return toResult(text, "hf-whisper-large-v3");
        }
      } catch {
        // fall through
      }
      const uploadedIvrit = await withTimeout(
        gradioUpload(IVRIT_SPACE, blob, fileName),
        GRADIO_SPACE_TIMEOUT_MS,
      );
      const hebrew = await withTimeout(
        transcribeWithIvritSpace({
          path: uploadedIvrit,
          orig_name: fileName,
          meta: { _type: "gradio.FileData" },
        }),
        GRADIO_SPACE_TIMEOUT_MS,
      );
      return toResult(hebrew, "hf-ivrit-whisper");
    })(),
    GRADIO_TIMEOUT_MS,
  );
}
