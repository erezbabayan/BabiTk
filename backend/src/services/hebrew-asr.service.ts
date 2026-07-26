import { toFile } from "openai/uploads";
import OpenAI from "openai";

import { env } from "../config/env.js";
import {
  applyHebrewAsrSpellingFixes,
  HEBREW_ASR_WHISPER_PROMPT,
} from "../lib/ingest/hebrewAsrSpelling.js";

export interface TranscribeAudioResult {
  text: string;
  durationSeconds: number;
}

export type HebrewAsrEngine = "runpod" | "groq" | "openai";

export interface HebrewAsrResult extends TranscribeAudioResult {
  engine: HebrewAsrEngine;
}

const IVRIT_WHISPER_MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2";

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

function durationFromSegments(segments: unknown[], fallbackSeconds: number): number {
  let maxEnd = 0;
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const end = (seg as RunPodSegment).end;
    if (typeof end === "number" && end > maxEnd) maxEnd = end;
  }
  return Math.max(1, Math.ceil(maxEnd || fallbackSeconds));
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

function buildMultipartBody(
  audio: Buffer,
  fileName: string,
  mimeType: string,
  fields: Record<string, string>,
): { body: Buffer; contentType: string } {
  const boundary = `----MindTaskerAsr${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    ),
  );
  chunks.push(audio);
  chunks.push(Buffer.from("\r\n", "utf8"));
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function buildEngineOrder(): HebrewAsrEngine[] {
  if (env.hebrewAsrEngine === "runpod") return ["runpod"];
  if (env.hebrewAsrEngine === "groq") return ["groq"];
  if (env.hebrewAsrEngine === "openai") return ["openai"];

  const order: HebrewAsrEngine[] = [];
  if (env.runpodApiKey && env.runpodEndpointId) order.push("runpod");
  if (env.groqApiKey) order.push("groq");
  order.push("openai");
  return order;
}

async function transcribeViaRunPod(
  audio: Buffer,
  estimatedSeconds: number,
): Promise<HebrewAsrResult> {
  const apiKey = env.runpodApiKey;
  const endpointId = env.runpodEndpointId;
  if (!apiKey || !endpointId) {
    throw new Error("RunPod is not configured");
  }

  const payload = {
    input: {
      type: "blob",
      model: env.runpodWhisperModel || IVRIT_WHISPER_MODEL,
      engine: "faster-whisper",
      streaming: false,
      transcribe_args: {
        language: "he",
        diarize: false,
        output_options: {
          word_timestamps: false,
          extra_data: false,
        },
        verbose: false,
        blob: audio.toString("base64"),
      },
    },
  };

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error("RunPod API key invalid");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RunPod transcription failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    status?: string;
    output?: unknown;
    error?: string;
  };

  if (data.status === "FAILED" || data.error) {
    throw new Error(data.error ?? "RunPod job failed");
  }

  const segments = extractSegmentsFromRunPodOutput(data.output);
  const text = collectSegmentText(segments);
  if (!text) {
    throw new Error("RunPod returned empty transcription");
  }

  return {
    text,
    durationSeconds: durationFromSegments(segments, estimatedSeconds),
    engine: "runpod",
  };
}

async function transcribeViaGroq(
  audio: Buffer,
  fileName: string,
  mimeType: string,
): Promise<HebrewAsrResult> {
  const apiKey = env.groqApiKey;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const { body, contentType } = buildMultipartBody(audio, fileName, mimeType, {
    model: env.groqWhisperModel,
    language: "he",
    response_format: "verbose_json",
    prompt: HEBREW_ASR_WHISPER_PROMPT,
  });

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
    },
    body,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Groq Whisper HTTP ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as { text?: string; duration?: number };
  const text = data.text?.trim();
  if (!text) {
    throw new Error("Groq returned empty transcription");
  }

  return {
    text,
    durationSeconds: Math.max(
      1,
      Math.ceil(typeof data.duration === "number" ? data.duration : audio.length / 12_000),
    ),
    engine: "groq",
  };
}

async function transcribeViaOpenAi(
  audio: Buffer,
  fileName: string,
  mimeType: string,
): Promise<HebrewAsrResult> {
  const openai = new OpenAI({ apiKey: env.openaiApiKey });
  const file = await toFile(audio, fileName, { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: env.openaiWhisperModel,
    language: "he",
    response_format: "verbose_json",
    prompt: HEBREW_ASR_WHISPER_PROMPT,
  });

  const text = applyHebrewAsrSpellingFixes(transcription.text?.trim() ?? "");
  if (!text) {
    throw new Error("Whisper returned empty transcription");
  }

  const durationSeconds = Math.max(
    1,
    Math.ceil(
      "duration" in transcription && typeof transcription.duration === "number"
        ? transcription.duration
        : audio.length / 16_000,
    ),
  );

  return { text, durationSeconds, engine: "openai" };
}

/**
 * Cascade: RunPod ivrit → Groq Whisper → OpenAI.
 * Self-host RunPod when needed — do not wrap the public Eliezer WhatsApp API.
 */
export async function transcribeHebrewAudio(
  audio: Buffer,
  fileName: string,
  mimeType = "audio/ogg",
): Promise<HebrewAsrResult> {
  const estimatedSeconds = Math.max(1, Math.ceil(audio.length / 16_000));
  const order = buildEngineOrder();
  let lastError: unknown;

  for (let i = 0; i < order.length; i += 1) {
    const engine = order[i]!;
    try {
      let result: HebrewAsrResult;
      if (engine === "runpod") {
        result = await transcribeViaRunPod(audio, estimatedSeconds);
        console.log(`[hebrewAsr] engine=runpod chars=${result.text.length}`);
      } else if (engine === "groq") {
        result = await transcribeViaGroq(audio, fileName, mimeType);
        console.log(`[hebrewAsr] engine=groq chars=${result.text.length}`);
      } else {
        result = await transcribeViaOpenAi(audio, fileName, mimeType);
        console.log(`[hebrewAsr] engine=openai chars=${result.text.length}`);
      }
      return {
        ...result,
        text: applyHebrewAsrSpellingFixes(result.text),
      };
    } catch (error) {
      lastError = error;
      if (i >= order.length - 1) break;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[hebrewAsr] ${engine} failed, trying next: ${message}`);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "תמלול נכשל"));
}
