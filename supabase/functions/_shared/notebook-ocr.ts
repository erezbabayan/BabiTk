/**
 * Notebook / photo OCR cascade for Edge:
 * 1. Gemini Flash (when GEMINI_API_KEY) — free, strong Hebrew print + handwriting
 * 2. Groq Llama-4 Scout (when GROQ_API_KEY)
 * 3. OpenAI GPT-4o
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

const GROQ_VISION_MODEL_DEFAULT = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_VISION_MODEL_FALLBACKS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-11b-vision-preview",
] as const;
const GEMINI_VISION_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.8-flash",
] as const;

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
      readRuntimeEnv("GROQ_API_KEY") ||
      readRuntimeEnv("OPENAI_API_KEY"),
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
}): Promise<string> {
  const userContent = params.imageDataUrl
    ? [
        { type: "text", text: params.userText },
        { type: "image_url", image_url: { url: params.imageDataUrl } },
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
          parts: [
            { text: notebookVisionTranscriptionPrompt },
            {
              inlineData: {
                mimeType: normalizeImageMime(mimeType),
                data: bytesToBase64(bytes),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: MAX_OCR_OUTPUT_TOKENS,
      },
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

function isTransientGeminiError(message: string): boolean {
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await ocrWithGemini(bytes, mimeType, apiKey, model);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientGeminiError(message) || attempt === 2) break;
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
  });
}

async function ocrWithOpenAi(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  return await chatCompletion({
    url: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model,
    system: notebookVisionTranscriptionPrompt,
    userText: "תמלל את התמונה.",
    imageDataUrl: toDataUrl(bytes, mimeType),
    maxTokens: MAX_OCR_OUTPUT_TOKENS,
  });
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
  const openAiKey = readRuntimeEnv("OPENAI_API_KEY");
  const groqModel = readRuntimeEnv("GROQ_VISION_MODEL") || GROQ_VISION_MODEL_DEFAULT;
  const openAiModel = readRuntimeEnv("OPENAI_VISION_MODEL") || "gpt-4o";
  const geminiModel = readRuntimeEnv("GEMINI_VISION_MODEL") || GEMINI_VISION_MODELS[0];
  const errors: string[] = [];

  if (geminiKey) {
    const models = [
      geminiModel,
      ...GEMINI_VISION_MODELS.filter((model) => model !== geminiModel),
    ];
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
    const models = [
      groqModel,
      ...GROQ_VISION_MODEL_FALLBACKS.filter((model) => model !== groqModel),
    ];
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

  if (openAiKey) {
    try {
      const rawTranscription = clipOcrText(
        await ocrWithOpenAi(bytes, imageMimeType, openAiKey, openAiModel),
      );
      return { rawTranscription, imageMimeType, engine: "openai" };
    } catch (error) {
      errors.push(`openai:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    errors.length > 0 ? `vision_ocr_failed:${errors.join(" | ")}` : "vision_ocr_not_configured",
  );
}

export async function refineNotebookTranscription(rawTranscription: string): Promise<string> {
  const trimmed = applyHebrewAsrSpellingFixes(clipOcrText(rawTranscription));
  if (!trimmed) return trimmed;
  const geminiKey = readRuntimeEnv("GEMINI_API_KEY");
  const groqKey = readRuntimeEnv("GROQ_API_KEY");
  const openAiKey = readRuntimeEnv("OPENAI_API_KEY");
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
      // Groq / OpenAI / raw
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
          maxTokens: MAX_OCR_OUTPUT_TOKENS,
        }),
      ),
    );

  if (openAiKey) {
    try {
      return await tryRefine(
        "https://api.openai.com/v1/chat/completions",
        openAiKey,
        readRuntimeEnv("OPENAI_PARSE_MODEL") || "gpt-4o-mini",
      );
    } catch {
      // Groq / raw
    }
  }
  if (groqKey) {
    try {
      return await tryRefine(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey,
        readRuntimeEnv("GROQ_PARSE_MODEL") || "llama-3.3-70b-versatile",
      );
    } catch {
      // keep raw
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
