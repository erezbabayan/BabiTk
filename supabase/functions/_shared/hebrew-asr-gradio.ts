/**
 * Last-resort Hebrew ASR via public Hugging Face Whisper Spaces.
 * Used only when Groq/OpenAI keys are missing on the Edge Function.
 * Do NOT wrap eliezer.ivrit.ai.
 *
 * Prefer the Hebrew-tuned space. The generic hf-audio space often errors
 * after a slow upload and used to exhaust the WhatsApp webhook budget
 * before transcription could run.
 */

import { audioDataUrl, isPublicMediaUrl, tightAudioBytes } from "./audio-format.ts";

const HF_AUDIO_SPACE = "https://hf-audio-whisper-large-v3.hf.space";
const IVRIT_SPACE = "https://ortalhanuna-speech2text-hebrew.hf.space";
const GRADIO_TIMEOUT_MS = 24_000;
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
    if (event === "error" && (!dataLine || dataLine === "null")) {
      continue;
    }
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
  timeoutMs: number,
): Promise<string> {
  const form = new FormData();
  form.append("files", audioBlob(audio, mimeType), fileName);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    body: form,
    signal: timeoutSignal(timeoutMs),
  });
  if (!response.ok) throw new Error(`gradio_upload_${response.status}`);
  const body: unknown = await response.json();
  const path = Array.isArray(body) && typeof body[0] === "string" ? body[0] : "";
  if (!path) throw new Error("gradio_upload_empty");
  return path;
}

async function gradioCall(
  space: string,
  apiName: string,
  data: unknown[],
  timeoutMs: number,
): Promise<string> {
  const started = await fetch(`${space}/gradio_api/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal: timeoutSignal(Math.min(12_000, timeoutMs)),
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
    signal: timeoutSignal(timeoutMs),
  });
  if (!stream.ok) throw new Error(`gradio_stream_${stream.status}`);
  const sse = await stream.text();
  const text = parseGradioSseText(sse);
  if (text) return text;
  if (/\bevent:\s*error\b/i.test(sse)) throw new Error("gradio_event_error");
  throw new Error("empty_transcription");
}

async function transcribeWithSpace(
  space: string,
  apiName: string,
  extraArgs: unknown[],
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  sourceUrl: string | undefined,
  timeoutMs: number,
): Promise<string> {
  const errors: string[] = [];
  if (sourceUrl && isPublicMediaUrl(sourceUrl)) {
    try {
      return await gradioCall(
        space,
        apiName,
        [filePayload(sourceUrl, fileName), ...extraArgs],
        timeoutMs,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "url_failed");
    }
  }
  try {
    const uploaded = await gradioUpload(
      space,
      audio,
      fileName,
      mimeType,
      Math.min(12_000, timeoutMs),
    );
    return await gradioCall(
      space,
      apiName,
      [filePayload(uploaded, fileName), ...extraArgs],
      timeoutMs,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "upload_failed");
  }
  try {
    const dataUrl = audioDataUrl(audio, mimeType);
    return await gradioCall(
      space,
      apiName,
      [filePayload(dataUrl, fileName), ...extraArgs],
      timeoutMs,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "data_url_failed");
    throw new Error(`gradio_space_failed:${errors.join(",")}`);
  }
}

export async function transcribeViaPublicWhisper(
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
  sourceUrl?: string,
): Promise<string> {
  const spaces: Array<{
    space: string;
    apiName: string;
    extraArgs: unknown[];
    timeoutMs: number;
  }> = [
    {
      space: IVRIT_SPACE,
      apiName: "run_transcription",
      extraArgs: [],
      timeoutMs: GRADIO_TIMEOUT_MS,
    },
    {
      space: HF_AUDIO_SPACE,
      apiName: "transcribe",
      extraArgs: ["transcribe"],
      timeoutMs: 8_000,
    },
  ];
  const errors: string[] = [];
  for (const candidate of spaces) {
    try {
      const text = await transcribeWithSpace(
        candidate.space,
        candidate.apiName,
        candidate.extraArgs,
        audio,
        fileName,
        mimeType,
        sourceUrl,
        candidate.timeoutMs,
      );
      if (text.trim()) return text.trim();
    } catch (error) {
      errors.push(
        `${candidate.apiName}:${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }
  throw new Error(
    errors.length > 0
      ? `gradio_failed: ${errors.join("; ")}`
      : "empty_transcription",
  );
}
