"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";

import {
  buildParseInputJsonSchema,
  buildParseInputSystemPrompt,
} from "./lib/ingest/parsePrompt";
import { enforceIngestionRules } from "./lib/ingest/entityRules";
import { buildLearnedPreferencesPrompt } from "./lib/ingest/ingestLearning";
import { parseInputLocally } from "./lib/ingest/localParse";
import { isOpenAiUsable } from "./lib/ingest/parseInput";
import type { ParseInputOptions, ParseInputResponse } from "./lib/ingest/types";
import { isValidParseResponse } from "./lib/ingest/types";
import {
  inboundHebrewProofreadPrompt,
  notebookLinguisticEditPrompt,
  type NotebookOcrMetadata,
} from "./lib/ingest/notebookOcr";
import { isVisionOcrConfigured } from "./lib/imageVision";
import { getTimezoneOffset } from "./lib/ingest/timezone";
import { correctEnglishKeyboardHebrew } from "./lib/ingest/englishKeyboardHebrew";
import {
  applyHebrewAsrSpellingFixes,
  HEBREW_ASR_WHISPER_PROMPT,
} from "./lib/ingest/hebrewAsrSpelling";
import { preserveInboundLineStructure } from "./lib/ingest/textStructure";

function requireOpenAiApiKey(explicit?: string): string {
  const apiKey = (explicit ?? process.env.OPENAI_API_KEY)?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "תמלול קולי לא מוגדר בשרת (חסר OPENAI_API_KEY ב־Convex). פנו למנהל המערכת.",
    );
  }
  return apiKey;
}

/**
 * Capture OpenAI-related env vars at the start of a Node action, before any `await`.
 * Concurrent Node actions can briefly clear `process.env` mid-flight; snapshot avoids that.
 */
export function snapshotOpenAiEnv(): {
  apiKey: string;
  whisperModel: string;
  parseModel: string;
  visionModel: string;
} {
  return {
    apiKey: requireOpenAiApiKey(),
    whisperModel: process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1",
    parseModel: process.env.OPENAI_PARSE_MODEL?.trim() || "gpt-4o-mini",
    visionModel: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o",
  };
}

function openaiClient(apiKey?: string): OpenAI {
  return new OpenAI({ apiKey: requireOpenAiApiKey(apiKey) });
}

export interface TranscribeAudioResult {
  text: string;
  durationSeconds: number;
}

export async function downloadMedia(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

/** Whisper is picky about extensions / MIME; normalize Expo/Android recordings. */
function normalizeWhisperUpload(
  fileName: string,
  mimeType: string,
): { fileName: string; mimeType: string } {
  const mime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") || lowerName.endsWith(".m4a") || lowerName.endsWith(".mp4") || lowerName.endsWith(".caf")) {
    return { fileName: lowerName.endsWith(".m4a") || lowerName.endsWith(".mp4") ? fileName.replace(/\.[^.]+$/, ".m4a") : "capture.m4a", mimeType: "audio/mp4" };
  }
  if (mime.includes("mpeg") || mime.includes("mp3") || lowerName.endsWith(".mp3")) {
    return { fileName: "capture.mp3", mimeType: "audio/mpeg" };
  }
  if (mime.includes("wav") || lowerName.endsWith(".wav")) {
    return { fileName: "capture.wav", mimeType: "audio/wav" };
  }
  if (mime.includes("webm") || lowerName.endsWith(".webm")) {
    return { fileName: "capture.webm", mimeType: "audio/webm" };
  }
  if (mime.includes("ogg") || lowerName.endsWith(".ogg") || lowerName.endsWith(".oga")) {
    return { fileName: "capture.ogg", mimeType: "audio/ogg" };
  }
  // Default: treat as m4a (Expo HIGH_QUALITY on Android/iOS).
  return { fileName: "capture.m4a", mimeType: "audio/mp4" };
}

function errorChainMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      if (current.message) parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(" | ");
}

function whisperErrorMessage(error: unknown): string {
  const raw = errorChainMessage(error);
  const lower = raw.toLowerCase();
  if (
    lower.includes("connection error") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("network") ||
    lower.includes("abort")
  ) {
    return "שגיאת חיבור לשרת התמלול (OpenAI). נסו שוב בעוד רגע.";
  }
  if (lower.includes("401") || lower.includes("invalid api key") || lower.includes("incorrect api key")) {
    return "מפתח OpenAI לא תקין בשרת. פנו למנהל המערכת.";
  }
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("quota")
  ) {
    return "נגמרה מכסת התמלול ב־OpenAI. אפשרויות: הטעינו קרדיט ב־OpenAI, הוסיפו GROQ_API_KEY ב־Convex, או הגדירו RunPod.";
  }
  if (lower.includes("unrecognized file format") || lower.includes("invalid file")) {
    return "פורמט ההקלטה לא נתמך לתמלול. נסו להקליט שוב.";
  }
  return raw || "תמלול נכשל";
}

function buildWhisperMultipartBody(
  audio: Buffer,
  fileName: string,
  mimeType: string,
  model: string,
): { body: Buffer; contentType: string } {
  const boundary = `----MindTaskerWhisper${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  const pushField = (name: string, value: string) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  };

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    ),
  );
  chunks.push(audio);
  chunks.push(Buffer.from("\r\n", "utf8"));
  pushField("model", model);
  pushField("language", "he");
  pushField("response_format", "verbose_json");
  pushField("prompt", HEBREW_ASR_WHISPER_PROMPT);
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function parseWhisperResponse(
  response: Response,
  audioLength: number,
): Promise<TranscribeAudioResult> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI Whisper HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as { text?: string; duration?: number };
  const text = applyHebrewAsrSpellingFixes(data.text?.trim() ?? "");
  if (!text) {
    throw new Error("Whisper returned empty transcription");
  }

  return {
    text,
    durationSeconds: Math.max(
      1,
      Math.ceil(typeof data.duration === "number" ? data.duration : audioLength / 12_000),
    ),
  };
}

/** Most reliable in Convex Node: no FormData/Blob — raw multipart Buffer. */
async function transcribeWithRawMultipart(
  audio: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<TranscribeAudioResult> {
  const { body, contentType } = buildWhisperMultipartBody(audio, fileName, mimeType, model);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
    },
    // Node Buffer is not typed as BodyInit in Convex's TS lib; Uint8Array is.
    body: new Uint8Array(body),
  });
  return await parseWhisperResponse(response, audio.length);
}

async function transcribeWithSdk(
  audio: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<TranscribeAudioResult> {
  const client = openaiClient(apiKey);
  const file = await toFile(audio, fileName, { type: mimeType });
  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    language: "he",
    response_format: "verbose_json",
    prompt: HEBREW_ASR_WHISPER_PROMPT,
  });
  const text = applyHebrewAsrSpellingFixes(transcription.text?.trim() ?? "");
  if (!text) {
    throw new Error("Whisper returned empty transcription");
  }
  return {
    text,
    durationSeconds: Math.max(
      1,
      Math.ceil(
        "duration" in transcription && typeof transcription.duration === "number"
          ? transcription.duration
          : audio.length / 12_000,
      ),
    ),
  };
}

export async function transcribeAudioBuffer(
  audio: Buffer,
  fileName: string,
  mimeType = "audio/ogg",
  openAi?: { apiKey: string; whisperModel?: string },
): Promise<TranscribeAudioResult> {
  const apiKey = requireOpenAiApiKey(openAi?.apiKey);
  const model = openAi?.whisperModel ?? process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
  const normalized = normalizeWhisperUpload(fileName, mimeType);

  if (audio.length < 64) {
    throw new Error("ההקלטה קצרה מדי או ריקה");
  }

  const attempts: Array<{ name: string; run: () => Promise<TranscribeAudioResult> }> = [
    {
      name: "raw-multipart",
      run: () =>
        transcribeWithRawMultipart(
          audio,
          normalized.fileName,
          normalized.mimeType,
          apiKey,
          model,
        ),
    },
    {
      name: "openai-sdk",
      run: () =>
        transcribeWithSdk(audio, normalized.fileName, normalized.mimeType, apiKey, model),
    },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]!;
    try {
      const result = await attempt.run();
      console.log(`[whisper] ok via=${attempt.name} bytes=${audio.length} chars=${result.text.length}`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[whisper] fail via=${attempt.name}: ${errorChainMessage(error)}`);
      if (i < attempts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }

  throw new Error(whisperErrorMessage(lastError));
}

/** Connectivity probe for OpenAI from Convex Node (models + tiny silent wav). */
export async function probeOpenAiTranscription(apiKey?: string): Promise<{
  modelsOk: boolean;
  whisperOk: boolean;
  modelsStatus?: number;
  whisperDetail?: string;
  keyPrefix: string;
}> {
  const key = requireOpenAiApiKey(apiKey);
  const keyPrefix = `${key.slice(0, 7)}…${key.slice(-4)}`;

  const modelsRes = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!modelsRes.ok) {
    const body = await modelsRes.text().catch(() => "");
    return {
      modelsOk: false,
      whisperOk: false,
      modelsStatus: modelsRes.status,
      whisperDetail: body.slice(0, 180),
      keyPrefix,
    };
  }

  // Minimal valid WAV (silence, ~0.1s) — enough for Whisper API to accept.
  const sampleRate = 8000;
  const samples = 800;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  try {
    const result = await transcribeWithRawMultipart(wav, "probe.wav", "audio/wav", key, "whisper-1");
    return {
      modelsOk: true,
      whisperOk: true,
      modelsStatus: 200,
      whisperDetail: `ok chars=${result.text.length}`,
      keyPrefix,
    };
  } catch (error) {
    return {
      modelsOk: true,
      whisperOk: false,
      modelsStatus: 200,
      whisperDetail: errorChainMessage(error).slice(0, 240),
      keyPrefix,
    };
  }
}

export async function parseInputWithOpenAI(
  options: ParseInputOptions,
): Promise<ParseInputResponse> {
  const timezone = options.timezone ?? "Asia/Jerusalem";
  const locale = options.locale ?? "he-IL";
  const referenceDate = options.referenceDate ?? new Date();

  const referenceIso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(referenceDate)
    .replace(" ", "T");

  const client = openaiClient();
  const model = process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: buildParseInputSystemPrompt({
          timezone,
          locale,
          referenceIso: `${referenceIso}${getTimezoneOffset(referenceDate, timezone)}`,
          allowedTags: options.allowedTags,
          learnedPreferences: buildLearnedPreferencesPrompt(options.lessons ?? []),
        }),
      },
      {
        role: "user",
        content: options.text.trim(),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: buildParseInputJsonSchema(options.allowedTags),
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty parse response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON for parse response");
  }

  if (!isValidParseResponse(parsed)) {
    throw new Error("AI response failed schema validation");
  }

  return enforceIngestionRules(parsed, {
    allowedTags: options.allowedTags,
    timezone,
    referenceDate,
    sourceText: options.text.trim(),
    lessons: options.lessons,
  });
}

/** Keyboard → ASR name lexicon → AI proofread. Safe to call before parse. */
export async function normalizeInboundCaptureText(text: string): Promise<string> {
  const keyboardFixed = correctEnglishKeyboardHebrew(text.trim());
  const lexiconFixed = applyHebrewAsrSpellingFixes(keyboardFixed);
  const proofread = await proofreadHebrewInboundText(lexiconFixed);
  return applyHebrewAsrSpellingFixes(proofread);
}

export async function parseInputForIngest(
  options: ParseInputOptions & { alreadyNormalized?: boolean },
): Promise<ParseInputResponse> {
  const proofread = options.alreadyNormalized
    ? options.text.trim()
    : await normalizeInboundCaptureText(options.text);
  const normalized: ParseInputOptions = {
    ...options,
    text: proofread,
  };
  if (!isOpenAiUsable()) {
    return parseInputLocally(normalized);
  }

  try {
    return await parseInputWithOpenAI(normalized);
  } catch {
    return parseInputLocally(normalized);
  }
}

export function sanitizeInboundText(text: string): { accepted: boolean; text: string } {
  // Keep line breaks so long structured notes stay readable (headings / one fact per line).
  const structured = preserveInboundLineStructure(text);
  const trimmed = correctEnglishKeyboardHebrew(structured);
  if (trimmed.replace(/\s+/g, "").length < 2) {
    return { accepted: false, text: trimmed };
  }
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(trimmed)) {
    return { accepted: false, text: trimmed };
  }
  return { accepted: true, text: trimmed };
}

/**
 * Soft Hebrew spelling / ASR / OCR proofread. Returns the original text if
 * models are unavailable or the call fails — never blocks ingest.
 */
export async function proofreadHebrewInboundText(text: string): Promise<string> {
  const trimmed = applyHebrewAsrSpellingFixes(text.trim());
  if (trimmed.length < 3) return trimmed;

  // Skip pure non-Hebrew short codes / Latin-only that we intentionally kept.
  const hebrewChars = (trimmed.match(/[\u0590-\u05FF]/g) ?? []).length;
  const latinChars = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (hebrewChars === 0 && latinChars > 0) return trimmed;

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const client = new OpenAI({ apiKey: openAiKey });
      const model = process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini";
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: inboundHebrewProofreadPrompt },
          { role: "user", content: trimmed },
        ],
      });
      const corrected = completion.choices[0]?.message?.content?.trim();
      if (corrected) return applyHebrewAsrSpellingFixes(corrected);
    } catch {
      // Fall through.
    }
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const client = new OpenAI({
        apiKey: groqKey,
        baseURL: "https://api.groq.com/openai/v1",
      });
      const completion = await client.chat.completions.create({
        model: process.env.GROQ_PARSE_MODEL?.trim() || "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [
          { role: "system", content: inboundHebrewProofreadPrompt },
          { role: "user", content: trimmed },
        ],
      });
      const corrected = completion.choices[0]?.message?.content?.trim();
      if (corrected) return applyHebrewAsrSpellingFixes(corrected);
    } catch {
      // keep raw
    }
  }

  return trimmed;
}

export function estimateAudioSeconds(buffer: Buffer, mimeType?: string): number {
  // Prefer bitrate-aware estimates so compressed m4a/AAC does not inflate quota checks.
  const mime = (mimeType ?? "").toLowerCase();
  let bytesPerSecond = 16_000; // ~128 kbps
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") || mime.includes("3gp")) {
    bytesPerSecond = 12_000; // typical Expo AAC voice ~96 kbps
  } else if (mime.includes("ogg") || mime.includes("opus") || mime.includes("webm")) {
    bytesPerSecond = 8_000;
  } else if (mime.includes("wav") || mime.includes("pcm")) {
    bytesPerSecond = 32_000;
  }
  return Math.max(1, Math.min(600, Math.ceil(buffer.length / bytesPerSecond)));
}

export interface NotebookOcrResult {
  extractedText: string;
  metadata: NotebookOcrMetadata;
  imageMimeType: string;
}

/** Phase A: OCR image text (Groq vision → OpenAI GPT-4o). */
export async function transcribeNotebookImageVision(
  image: Buffer,
  mimeType: string,
): Promise<{ rawTranscription: string; imageMimeType: string; engine?: string }> {
  const { transcribeCaptureImage } = await import("./lib/imageVision");
  const result = await transcribeCaptureImage(image, mimeType);
  return {
    rawTranscription: result.rawTranscription,
    imageMimeType: result.imageMimeType,
    engine: result.engine,
  };
}

/** Phase B: linguistic proofreading of OCR / ASR / typed text (OpenAI, else Groq, else raw). */
export async function refineNotebookTranscription(rawTranscription: string): Promise<string> {
  const trimmed = rawTranscription.trim();
  if (!trimmed) {
    throw new Error("Cannot refine empty transcription");
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const client = new OpenAI({ apiKey: openAiKey });
      const model = process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini";
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: notebookLinguisticEditPrompt },
          { role: "user", content: trimmed },
        ],
      });
      const corrected = completion.choices[0]?.message?.content?.trim();
      if (corrected) return corrected;
    } catch {
      // Fall through to Groq / raw.
    }
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const client = new OpenAI({
        apiKey: groqKey,
        baseURL: "https://api.groq.com/openai/v1",
      });
      const completion = await client.chat.completions.create({
        model: process.env.GROQ_PARSE_MODEL?.trim() || "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [
          { role: "system", content: notebookLinguisticEditPrompt },
          { role: "user", content: trimmed },
        ],
      });
      const corrected = completion.choices[0]?.message?.content?.trim();
      if (corrected) return corrected;
    } catch {
      // keep raw
    }
  }

  return trimmed;
}

/** Vision pipeline: GPT-4o OCR → GPT-4o-mini proofread. */
export async function processNotebookOcr(
  image: Buffer,
  mimeType: string,
): Promise<NotebookOcrResult> {
  if (!isVisionOcrConfigured()) {
    throw new Error("Vision OCR is not configured (GROQ_API_KEY or OPENAI_API_KEY)");
  }

  const { rawTranscription, imageMimeType } = await transcribeNotebookImageVision(
    image,
    mimeType,
  );
  const correctedTranscription = await refineNotebookTranscription(rawTranscription);

  return {
    extractedText: correctedTranscription,
    metadata: {
      raw_transcription: rawTranscription,
      corrected_transcription: correctedTranscription,
    },
    imageMimeType,
  };
}
