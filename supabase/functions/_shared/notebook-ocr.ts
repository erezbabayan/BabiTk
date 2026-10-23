/**
 * Notebook / photo OCR cascade for Edge (free tiers only):
 * 1. Gemini (when GEMINI_API_KEY) — gemini-3.5-flash-lite, then gemini-3.6-flash;
 *    one retry each on transient errors (429/5xx/overloaded).
 * 2. Groq qwen/qwen3.8-27b vision (when GROQ_API_KEY) — free last resort.
 * No OpenAI / paid vision step.
 *
 * Proofread (refineNotebookTranscription) stays a separate step:
 * Gemini GEMINI_PARSE_MODEL → Groq qwen/qwen3.8-27b → Groq openai/gpt-oss-120b → raw.
 *
 * One photo ≈ one page. Output is capped at MAX_OCR_OUTPUT_CHARS (~1,500 Hebrew words).
 */

import { inboundHebrewProofreadPrompt } from "../../../convex/lib/ingest/notebookOcr.ts";
import { bytesToBase64 } from "./audio-format.ts";
import {
  imageFileName,
  mimeForImageContainer,
  normalizeImageMime,
  sniffImageContainer,
} from "./image-bytes.ts";
import { applyHebrewAsrSpellingFixes } from "./hebrew-asr-proofread.ts";
import { readRuntimeEnv } from "./runtime-env.ts";
import { titleFromInboundText } from "./voice-text.ts";

export const MAX_NOTEBOOK_IMAGE_BYTES = 4_500_000;
export const MAX_OCR_OUTPUT_TOKENS = 2048;
/** Hard cap after OCR — roughly a dense notebook page. */
export const MAX_OCR_OUTPUT_CHARS = 8_000;
export const OCR_TIMEOUT_MS = 20_000;

export const notebookVisionTranscriptionPrompt = `תמלל את כל הטקסט הנראה בתמונה מילה במילה.
זה יכול להיות מחברת בכתב יד, צילום מסך, רשימת משימות, פתק, לוח, מסמך מודפס, או צ'ק־ליסט.
כל שורה / נקודה / סעיף ממוספר = שורה נפרדת בפלט (שורה חדשה בין פריטים).
אל תוסיף הסברים, אל תתקן שגיאות כתיב בשלב זה, ואם מילה לא ברורה — שים סימן שאלה (?).
אם אין טקסט קריא בכלל — החזר מחרוזת ריקה.
החזר רק את התמלול, בלי כותרות ובלי JSON.`;

/** Groq vision model (verified against GET /openai/v1/models, 2026-10-23). */
export const GROQ_VISION_MODEL_DEFAULT = "qwen/qwen3.8-27b";
/** Groq text models for the proofread fallback, in order. */
export const GROQ_PARSE_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] as const;
/** Free-tier Gemini vision models, best first (stable, no announced shutdown). */
export const GEMINI_VISION_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"] as const;
/** Attempts per Gemini model: 1 try + 1 retry on transient errors. */
export const GEMINI_ATTEMPTS_PER_MODEL = 2;
/** Low thinking keeps OCR fast; thinking tokens count against maxOutputTokens. */
const GEMINI_THINKING: Record<string, { level: string; headroomTokens: number }> = {
  "gemini-3.5-flash-lite": { level: "minimal", headroomTokens: 512 },
  "gemini-3.6-flash": { level: "low", headroomTokens: 1536 },
};

/** "openai" is kept only so older stored `vision_engine` values still type-check; it is never produced. */
export type VisionOcrEngine = "gemini" | "groq" | "openai";

export type NotebookOcrResult = {
  rawText: string;
  correctedText: string;
  title: string;
  engine: VisionOcrEngine;
  imageMimeType: string;
};

/** WhatsApp ingest historically passed this object into applyImageOcr, which reads `content`. */
export type NotebookOcrApplyText = {
  content?: string;
  correctedText?: string;
  rawText?: string;
  title?: string;
};

function asNonEmptyText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Prefer `content`, then `correctedText`, then `rawText` — never call `.trim()` on undefined. */
export function notebookBodyFromOcr(transcribed: NotebookOcrApplyText): {
  title: string;
  content: string;
  rawText: string;
} {
  const content =
    asNonEmptyText(transcribed.content) ||
    asNonEmptyText(transcribed.correctedText) ||
    asNonEmptyText(transcribed.rawText);
  const rawText = asNonEmptyText(transcribed.rawText) || content;
  const title = asNonEmptyText(transcribed.title) || titleFromInboundText(content);
  return { title, content, rawText };
}

export function isVisionOcrConfigured(): boolean {
  return Boolean(
    readRuntimeEnv("GEMINI_API_KEY") ||
      readRuntimeEnv("GROQ_API_KEY"),
  );
}

export function clipOcrText(text: string): string {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (trimmed.length <= MAX_OCR_OUTPUT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_OCR_OUTPUT_CHARS).trimEnd();
}

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${normalizeImageMime(mimeType)};base64,${bytesToBase64(bytes)}`;
}

export function textFromGeminiGenerateContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    error?: { message?: unknown };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
      finishReason?: unknown;
    }>;
  };
  if (typeof record.error?.message === "string" && record.error.message.trim()) {
    throw new Error(record.error.message.trim());
  }
  const parts = record.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return text;
}

function chatContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: unknown };
  };
  if (typeof record.error?.message === "string" && record.error.message.trim()) {
    throw new Error(record.error.message.trim());
  }
  const content = record.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

async function chatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  system?: string;
  userText: string;
  imageDataUrl?: string;
  maxTokens: number;
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  const userContent = params.imageDataUrl
    ? [
        { type: "image_url", image_url: { url: params.imageDataUrl } },
        { type: "text", text: params.userText },
      ]
    : params.userText;
  const messages: Array<Record<string, unknown>> = [];
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  messages.push({ role: "user", content: userContent });
  const response = await fetch(params.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      max_tokens: params.maxTokens,
      messages,
      ...(params.extraBody ?? {}),
    }),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = chatContent(body) || `http_${response.status}`;
    throw new Error(detail);
  }
  const text = chatContent(body);
  if (!text) throw new Error("empty_ocr");
  return text;
}

/** Image part first, then the instruction (Gemini's recommended order for single-image prompts). */
export function geminiOcrParts(bytes: Uint8Array, mimeType: string): Array<Record<string, unknown>> {
  return [
    {
      inlineData: {
        mimeType: normalizeImageMime(mimeType),
        data: bytesToBase64(bytes),
      },
    },
    { text: notebookVisionTranscriptionPrompt },
  ];
}

export function geminiOcrGenerationConfig(model: string): Record<string, unknown> {
  const thinking = GEMINI_THINKING[model];
  return {
    temperature: 0,
    maxOutputTokens: MAX_OCR_OUTPUT_TOKENS + (thinking?.headroomTokens ?? 0),
    ...(thinking ? { thinkingConfig: { thinkingLevel: thinking.level } } : {}),
  };
}

async function ocrWithGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: geminiOcrParts(bytes, mimeType),
        },
      ],
      generationConfig: geminiOcrGenerationConfig(model),
    }),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let detail = `http_${response.status}`;
    try {
      detail = textFromGeminiGenerateContent(body) || detail;
    } catch (error) {
      detail = error instanceof Error && error.message.trim() ? error.message : detail;
    }
    throw new Error(detail);
  }
  const text = textFromGeminiGenerateContent(body);
  if (!text) throw new Error("empty_ocr");
  return text;
}

export function isTransientGeminiError(message: string): boolean {
  return /http_429|http_503|http_500|http_502|http_504|overloaded|unavailable|resource.?exhausted|high demand/i.test(
    message,
  );
}

async function ocrWithGeminiRetrying(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < GEMINI_ATTEMPTS_PER_MODEL; attempt += 1) {
    try {
      return await ocrWithGemini(bytes, mimeType, apiKey, model);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientGeminiError(message) || attempt === GEMINI_ATTEMPTS_PER_MODEL - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function ocrWithGroq(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  return await chatCompletion({
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    userText: notebookVisionTranscriptionPrompt,
    imageDataUrl: toDataUrl(bytes, mimeType),
    maxTokens: MAX_OCR_OUTPUT_TOKENS,
    extraBody: groqReasoningBody(model),
  });
}

/** Qwen 3.8 on Groq: reasoning off (plain transcription). GPT-OSS: low effort, hidden. */
export function groqReasoningBody(model: string): Record<string, unknown> {
  if (/^qwen\//i.test(model)) return { reasoning_effort: "none" };
  if (/^openai\/gpt-oss/i.test(model)) return { reasoning_effort: "low", include_reasoning: false };
  return {};
}

/** An env override replaces the first slot; the chain is always at most 2 Gemini models. */
export function geminiVisionModelOrder(override?: string | null): string[] {
  const first = override?.trim() || GEMINI_VISION_MODELS[0];
  const rest = GEMINI_VISION_MODELS.filter((model) => model !== first);
  return [first, ...rest].slice(0, 2);
}

export async function transcribeCaptureImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ rawTranscription: string; imageMimeType: string; engine: VisionOcrEngine }> {
  if (bytes.byteLength < 32) {
    throw new Error("image_too_small");
  }
  if (bytes.byteLength > MAX_NOTEBOOK_IMAGE_BYTES) {
    throw new Error("image_too_large");
  }
  const imageMimeType = mimeForImageContainer(
    sniffImageContainer(bytes),
    normalizeImageMime(mimeType),
  );
  const geminiKey = readRuntimeEnv("GEMINI_API_KEY");
  const groqKey = readRuntimeEnv("GROQ_API_KEY");
  const groqModel = readRuntimeEnv("GROQ_VISION_MODEL") || GROQ_VISION_MODEL_DEFAULT;
  const errors: string[] = [];

  if (geminiKey) {
    const models = geminiVisionModelOrder(readRuntimeEnv("GEMINI_VISION_MODEL"));
    for (const model of models) {
      try {
        const rawTranscription = clipOcrText(
          await ocrWithGeminiRetrying(bytes, imageMimeType, geminiKey, model),
        );
        return { rawTranscription, imageMimeType, engine: "gemini" };
      } catch (error) {
        errors.push(
          `gemini(${model}):${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (groqKey) {
    const models = [...new Set([groqModel, GROQ_VISION_MODEL_DEFAULT])];
    for (const model of models) {
      try {
        const rawTranscription = clipOcrText(
          await ocrWithGroq(bytes, imageMimeType, groqKey, model),
        );
        return { rawTranscription, imageMimeType, engine: "groq" };
      } catch (error) {
        errors.push(
          `groq(${model}):${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  throw new Error(
    errors.length > 0 ? `vision_ocr_failed:${errors.join(" | ")}` : "vision_ocr_not_configured",
  );
}

/** Some models swap ASCII hyphens for U+2011 / U+2010; keep plain hyphens so text matches the source. */
export function normalizeProofreadPunctuation(text: string): string {
  return text.replace(/[\u2010\u2011]/g, "-");
}

export async function refineNotebookTranscription(rawTranscription: string): Promise<string> {
  const trimmed = applyHebrewAsrSpellingFixes(clipOcrText(rawTranscription));
  if (!trimmed) return trimmed;
  const geminiKey = readRuntimeEnv("GEMINI_API_KEY");
  const groqKey = readRuntimeEnv("GROQ_API_KEY");
  if (geminiKey) {
    try {
      const model = readRuntimeEnv("GEMINI_PARSE_MODEL") || "gemini-3.1-flash-lite";
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
        `?key=${encodeURIComponent(geminiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: inboundHebrewProofreadPrompt }] },
          contents: [{ role: "user", parts: [{ text: trimmed }] }],
          generationConfig: { temperature: 0, maxOutputTokens: MAX_OCR_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const refined = clipOcrText(
          applyHebrewAsrSpellingFixes(textFromGeminiGenerateContent(body)),
        );
        if (refined) return refined;
      }
    } catch {
      // Groq / raw
    }
  }
  const tryRefine = async (url: string, apiKey: string, model: string) =>
    clipOcrText(
      applyHebrewAsrSpellingFixes(
        await chatCompletion({
          url,
          apiKey,
          model,
          system: inboundHebrewProofreadPrompt,
          userText: trimmed,
          // GPT-OSS reasoning tokens count against max_tokens.
          maxTokens: MAX_OCR_OUTPUT_TOKENS + 1024,
          extraBody: groqReasoningBody(model),
        }),
      ),
    );

  if (groqKey) {
    const override = readRuntimeEnv("GROQ_PARSE_MODEL");
    const models = [...new Set([...(override ? [override] : []), ...GROQ_PARSE_MODELS])];
    for (const model of models) {
      try {
        const refined = normalizeProofreadPunctuation(
          await tryRefine("https://api.groq.com/openai/v1/chat/completions", groqKey, model),
        );
        if (refined) return refined;
      } catch {
        // next Groq model / keep raw
      }
    }
  }
  return trimmed;
}

export async function transcribeAndProofreadImage(params: {
  bytes: Uint8Array;
  mimeType: string;
  caption?: string;
}): Promise<NotebookOcrResult> {
  const vision = await transcribeCaptureImage(params.bytes, params.mimeType);
  const caption = params.caption?.trim() ?? "";
  const combinedRaw = clipOcrText(
    [vision.rawTranscription, caption].filter(Boolean).join("\n"),
  );
  if (!combinedRaw) {
    throw new Error("empty_ocr");
  }
  let correctedText = combinedRaw;
  try {
    correctedText = await refineNotebookTranscription(combinedRaw);
  } catch {
    correctedText = applyHebrewAsrSpellingFixes(combinedRaw);
  }
  return {
    rawText: combinedRaw,
    correctedText,
    title: titleFromInboundText(correctedText),
    engine: vision.engine,
    imageMimeType: vision.imageMimeType,
  };
}

export { imageFileName, normalizeImageMime };
