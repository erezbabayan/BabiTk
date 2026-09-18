/**
 * Last-resort Hebrew ASR via public Hugging Face Whisper Spaces.
 * Used only when Groq/OpenAI keys are missing on the Edge Function.
 * Do NOT wrap eliezer.ivrit.ai.
 */

import { audioDataUrl, isPublicMediaUrl, tightAudioBytes } from "./audio-format.ts";

const HF_AUDIO_SPACE = "https://hf-audio-whisper-large-v3.hf.space";
const IVRIT_SPACE = "https://ortalhanuna-speech2text-hebrew.hf.space";
const GRADIO_TIMEOUT_MS = 20_000;
const STATUS_LINES = /^(done!?|splitting audio.*|transcribing .*|chunk \d+\/\d+ done)$/i;

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function stripAsrTimestamps(text: string): string {
  return text
    .replace(/^\s*\[[^\]]+]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickTranscriptFromGradioData(data: unknown): string {
  if (typeof data === "string") return stripAsrTimestamps(data);
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

function filePayload(url: string, fileName: string): Record<string, unknown> {
  return {
    path: url,
    url,
    orig_name: fileName,
    meta: { _type: "gradio.FileData" },
  };
}

function audioBlob(audio: Uint8Array, mimeType: string): Blob {
  const copy = tightAudioBytes(audio);
  const standalone = new ArrayBuffer(copy.byteLength);
  new Uint8Array(standalone).set(copy);
  return new Blob([standalone], { type: mimeType });
}

async function gradioUpload(
  space: string,
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append("files", audioBlob(audio, mimeType), fileName);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    body: form,
    signal: timeoutSignal(12_000),
  });
  if (!response.ok) throw new Error(`gradio_upload_${response.status}`);
  const body: unknown = await response.json();
  const path = Array.isArray(body) && typeof body[0] === "string" ? body[0] : "";
  if (!path) throw new Error("gradio_upload_empty");
  return path;
}

async function gradioCall(space: string, apiName: string, data: unknown[]): Promise<string> {
  const started = await fetch(`${space}/gradio_api/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal: timeoutSignal(12_000),
  });
  if (!started.ok) throw new Error(`gradio_call_${started.status}`);
  const startedJson: unknown = await started.json();
  const eventId =
    startedJson &&
    typeof startedJson === "object" &&
    "event_id" in startedJson &&
    typeof (startedJson as { event_id: unknown }).event_id === "string"
      ? (startedJson as { event_id: string }).event_id
      : "";
  if (!eventId) throw new Error("gradio_event_missing");
  const stream = await fetch(`${space}/gradio_api/call/${apiName}/${eventId}`, {
    signal: timeoutSignal(GRADIO_TIMEOUT_MS),
  });
  if (!stream.ok) throw new Error(`gradio_stream_${stream.status}`);
  const text = parseGradioSseText(await stream.text());
  if (!text) throw new Error("empty_transcription");
  return text;
}

async function transcribeWithSpace(
  space: string,
  apiName: string,
  extraArgs: unknown[],
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  sourceUrl?: string,
): Promise<string> {
  if (sourceUrl && isPublicMediaUrl(sourceUrl)) {
    try {
      return await gradioCall(space, apiName, [filePayload(sourceUrl, fileName), ...extraArgs]);
    } catch {
      // fall through to upload
    }
  }
  try {
    const uploaded = await gradioUpload(space, audio, fileName, mimeType);
    return await gradioCall(space, apiName, [filePayload(uploaded, fileName), ...extraArgs]);
  } catch {
    const dataUrl = audioDataUrl(audio, mimeType);
    return await gradioCall(space, apiName, [filePayload(dataUrl, fileName), ...extraArgs]);
  }
}

export async function transcribeViaPublicWhisper(
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  sourceUrl?: string,
): Promise<string> {
  try {
    const text = await transcribeWithSpace(
      HF_AUDIO_SPACE,
      "transcribe",
      ["transcribe"],
      audio,
      fileName,
      mimeType,
      sourceUrl,
    );
    if (text.trim()) return text.trim();
  } catch {
    // Hebrew-tuned space next
  }
  const hebrew = await transcribeWithSpace(
    IVRIT_SPACE,
    "run_transcription",
    [],
    audio,
    fileName,
    mimeType,
    sourceUrl,
  );
  return hebrew.trim();
}
