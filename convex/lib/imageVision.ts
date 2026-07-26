/**
 * Image OCR cascade for WhatsApp / notebook photos:
 * 1. Groq Llama-4 Scout (when GROQ_API_KEY) — preferred when OpenAI quota is exhausted
 * 2. OpenAI GPT-4o Vision
 *
 * Only import from `"use node"` action files.
 */

import OpenAI from "openai";

import { notebookVisionTranscriptionPrompt } from "./ingest/notebookOcr";

export type VisionOcrEngine = "groq" | "openai";

export type VisionOcrResult = {
  rawTranscription: string;
  imageMimeType: string;
  engine: VisionOcrEngine;
};

const GROQ_VISION_MODEL_DEFAULT = "meta-llama/llama-4-scout-17b-16e-instruct";
/** Fallbacks when the preferred Groq vision model is removed / not entitled. */
const GROQ_VISION_MODEL_FALLBACKS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3.6-27b",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
] as const;

function normalizeImageMime(mimeType: string): string {
  const safe = mimeType.startsWith("image/")
    ? mimeType.split(";")[0]!.trim()
    : "image/jpeg";
  if (safe === "image/jpg") return "image/jpeg";
  return safe;
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${normalizeImageMime(mimeType)};base64,${buffer.toString("base64")}`;
}

async function ocrWithGroq(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: notebookVisionTranscriptionPrompt },
          {
            type: "image_url",
            image_url: { url: toDataUrl(buffer, mimeType) },
          },
        ],
      },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq vision returned empty transcription");
  return text;
}

async function ocrWithOpenAi(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: notebookVisionTranscriptionPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: toDataUrl(buffer, mimeType), detail: "auto" },
          },
        ],
      },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI vision returned empty transcription");
  return text;
}

function isQuotaOrBillingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b429\b|quota|billing|insufficient_quota|rate.?limit/i.test(msg);
}

/** True when at least one vision provider is configured. */
export function isVisionOcrConfigured(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );
}

/**
 * Transcribe handwritten / printed / checklist photos into plain text.
 * Prefers Groq when available so WhatsApp capture keeps working if OpenAI is over quota.
 */
export async function transcribeCaptureImage(
  buffer: Buffer,
  mimeType: string,
): Promise<VisionOcrResult> {
  const imageMimeType = normalizeImageMime(mimeType);
  const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const groqModel =
    process.env.GROQ_VISION_MODEL?.trim() || GROQ_VISION_MODEL_DEFAULT;
  const openAiModel = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
  const prefer =
    (process.env.VISION_OCR_ENGINE?.trim().toLowerCase() as
      | "groq"
      | "openai"
      | "auto"
      | "") || "auto";

  const errors: string[] = [];

  const tryGroq = async (): Promise<VisionOcrResult | null> => {
    if (!groqKey) return null;
    const models = [
      groqModel,
      ...GROQ_VISION_MODEL_FALLBACKS.filter((m) => m !== groqModel),
    ];
    for (const model of models) {
      try {
        const rawTranscription = await ocrWithGroq(
          buffer,
          imageMimeType,
          groqKey,
          model,
        );
        return { rawTranscription, imageMimeType, engine: "groq" };
      } catch (error) {
        errors.push(
          `groq(${model}):${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return null;
  };

  const tryOpenAi = async (): Promise<VisionOcrResult | null> => {
    if (!openAiKey) return null;
    try {
      const rawTranscription = await ocrWithOpenAi(
        buffer,
        imageMimeType,
        openAiKey,
        openAiModel,
      );
      return { rawTranscription, imageMimeType, engine: "openai" };
    } catch (error) {
      errors.push(
        `openai:${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  };

  if (prefer === "openai") {
    const openAi = await tryOpenAi();
    if (openAi) return openAi;
    const groq = await tryGroq();
    if (groq) return groq;
  } else if (prefer === "groq") {
    const groq = await tryGroq();
    if (groq) return groq;
    const openAi = await tryOpenAi();
    if (openAi) return openAi;
  } else {
    // auto: Groq first (reliable when OpenAI billing/quota fails), then OpenAI.
    const groq = await tryGroq();
    if (groq) return groq;
    const openAi = await tryOpenAi();
    if (openAi) return openAi;
  }

  const detail = errors.join(" | ") || "no_vision_provider";
  if (errors.some((e) => isQuotaOrBillingError(e))) {
    throw new Error(
      `Vision OCR failed (quota/billing). Configure GROQ_API_KEY or fix OpenAI billing. ${detail}`,
    );
  }
  throw new Error(`Vision OCR failed: ${detail}`);
}
