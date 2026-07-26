/**
 * Hebrew ASR cascade:
 * 1. RunPod ivrit.ai Whisper (best Hebrew, same stack as Eliezer) when configured
 * 2. Groq Whisper (fast free/cheap tier) when GROQ_API_KEY is set
 * 3. OpenAI whisper-1 as last resort
 *
 * Only import from `"use node"` action files.
 */

import {
  snapshotOpenAiEnv,
  transcribeAudioBuffer,
  type TranscribeAudioResult,
} from "../openaiPipeline";
import {
  applyHebrewAsrSpellingFixes,
  HEBREW_ASR_WHISPER_PROMPT,
} from "./ingest/hebrewAsrSpelling";

export const IVRIT_WHISPER_MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2";
export const GROQ_WHISPER_MODEL_DEFAULT = "whisper-large-v3-turbo";

export type HebrewAsrEngine = "runpod" | "groq" | "openai";

export interface HebrewAsrResult extends TranscribeAudioResult {
  engine: HebrewAsrEngine;
}

export type HebrewAsrEnginePreference = "runpod" | "groq" | "openai" | "auto";

export interface HebrewAsrEnvSnapshot {
  enginePreference: HebrewAsrEnginePreference;
  runpodApiKey: string;
  runpodEndpointId: string;
  runpodModel: string;
  groq: { apiKey: string; whisperModel: string } | null;
  openAi: { apiKey: string; whisperModel: string } | null;
}

/** Snapshot ASR-related env before any await (Node action env race). */
export function snapshotHebrewAsrEnv(): HebrewAsrEnvSnapshot {
  const preferenceRaw = process.env.HEBREW_ASR_ENGINE?.trim().toLowerCase() ?? "auto";
  const enginePreference: HebrewAsrEnginePreference =
    preferenceRaw === "runpod" ||
    preferenceRaw === "groq" ||
    preferenceRaw === "openai"
      ? preferenceRaw
      : "auto";
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
  return {
    enginePreference,
    runpodApiKey: process.env.RUNPOD_API_KEY?.trim() ?? "",
    runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID?.trim() ?? "",
    runpodModel: process.env.RUNPOD_WHISPER_MODEL?.trim() || IVRIT_WHISPER_MODEL,
    groq: groqKey
      ? {
          apiKey: groqKey,
          whisperModel:
            process.env.GROQ_WHISPER_MODEL?.trim() || GROQ_WHISPER_MODEL_DEFAULT,
        }
      : null,
    openAi: openAiKey
      ? {
          apiKey: openAiKey,
          whisperModel: process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1",
        }
      : null,
  };
}

function runpodConfigured(env: HebrewAsrEnvSnapshot): boolean {
  return Boolean(env.runpodApiKey && env.runpodEndpointId);
}

function groqConfigured(env: HebrewAsrEnvSnapshot): boolean {
  return Boolean(env.groq?.apiKey);
}

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

async function transcribeViaRunPod(
  audio: Buffer,
  env: HebrewAsrEnvSnapshot,
  estimatedSeconds: number,
): Promise<HebrewAsrResult> {
  const blob = audio.toString("base64");
  const payload = {
    input: {
      type: "blob",
      model: env.runpodModel,
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
        blob,
      },
    },
  };

  const url = `https://api.runpod.ai/v2/${env.runpodEndpointId}/runsync`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.runpodApiKey}`,
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
  env: HebrewAsrEnvSnapshot,
): Promise<HebrewAsrResult> {
  if (!env.groq) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const { body, contentType } = buildMultipartBody(audio, fileName, mimeType, {
    model: env.groq.whisperModel,
    language: "he",
    response_format: "verbose_json",
    prompt: HEBREW_ASR_WHISPER_PROMPT,
  });

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.groq.apiKey}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("מפתח Groq לא תקין");
    }
    if (response.status === 429) {
      throw new Error("מגבלת קצב Groq — נסו שוב בעוד רגע");
    }
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
  env: HebrewAsrEnvSnapshot,
): Promise<HebrewAsrResult> {
  if (!env.openAi) {
    snapshotOpenAiEnv();
  }
  const openAi = env.openAi ?? snapshotOpenAiEnv();
  const result = await transcribeAudioBuffer(audio, fileName, mimeType, {
    apiKey: openAi.apiKey,
    whisperModel: openAi.whisperModel,
  });
  return { ...result, engine: "openai" };
}

function buildEngineOrder(env: HebrewAsrEnvSnapshot): HebrewAsrEngine[] {
  if (env.enginePreference === "runpod") return ["runpod"];
  if (env.enginePreference === "groq") return ["groq"];
  if (env.enginePreference === "openai") return ["openai"];

  const order: HebrewAsrEngine[] = [];
  if (runpodConfigured(env)) order.push("runpod");
  if (groqConfigured(env)) order.push("groq");
  if (env.openAi) order.push("openai");
  return order;
}

/**
 * Transcribe Hebrew audio via configured ASR cascade.
 * Default auto order: RunPod → Groq → OpenAI.
 */
export async function transcribeHebrewAudio(
  audio: Buffer,
  fileName: string,
  mimeType = "audio/ogg",
  envSnapshot?: HebrewAsrEnvSnapshot,
): Promise<HebrewAsrResult> {
  const env = envSnapshot ?? snapshotHebrewAsrEnv();
  const estimatedSeconds = Math.max(1, Math.ceil(audio.length / 16_000));
  const order = buildEngineOrder(env);

  if (order.length === 0) {
    throw new Error(
      "אין מנוע תמלול מוגדר. הגדירו GROQ_API_KEY, RUNPOD_* או OPENAI_API_KEY ב־Convex.",
    );
  }

  let lastError: unknown;
  for (let i = 0; i < order.length; i += 1) {
    const engine = order[i]!;
    try {
      let result: HebrewAsrResult;
      if (engine === "runpod") {
        result = await transcribeViaRunPod(audio, env, estimatedSeconds);
        console.log(
          `[hebrewAsr] engine=runpod model=${env.runpodModel} chars=${result.text.length}`,
        );
      } else if (engine === "groq") {
        result = await transcribeViaGroq(audio, fileName, mimeType, env);
        console.log(
          `[hebrewAsr] engine=groq model=${env.groq?.whisperModel} chars=${result.text.length}`,
        );
      } else {
        result = await transcribeViaOpenAi(audio, fileName, mimeType, env);
        console.log(
          `[hebrewAsr] engine=openai model=${env.openAi?.whisperModel ?? "whisper-1"} chars=${result.text.length}`,
        );
      }
      return {
        ...result,
        text: applyHebrewAsrSpellingFixes(result.text),
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const hasNext = i < order.length - 1;
      if (!hasNext) break;
      console.warn(`[hebrewAsr] ${engine} failed, trying next: ${message}`);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "תמלול נכשל"));
}
