"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";

import {
  buildParseInputJsonSchema,
  buildParseInputSystemPrompt,
} from "./lib/ingest/parsePrompt";
import { enforceIngestionRules } from "./lib/ingest/entityRules";
import { parseInputLocally } from "./lib/ingest/localParse";
import { isOpenAiUsable } from "./lib/ingest/parseInput";
import type { ParseInputOptions, ParseInputResponse } from "./lib/ingest/types";
import { isValidParseResponse } from "./lib/ingest/types";
import {
  notebookLinguisticEditPrompt,
  notebookVisionTranscriptionPrompt,
  type NotebookOcrMetadata,
} from "./lib/ingest/notebookOcr";
import { getTimezoneOffset } from "./lib/ingest/timezone";

function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
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

export async function transcribeAudioBuffer(
  audio: Buffer,
  fileName: string,
  mimeType = "audio/ogg",
): Promise<TranscribeAudioResult> {
  const client = openaiClient();
  const model = process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
  const file = await toFile(audio, fileName, { type: mimeType });

  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    language: "he",
    response_format: "verbose_json",
  });

  const text = transcription.text?.trim();
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

  return { text, durationSeconds };
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
  });
}

export async function parseInputForIngest(
  options: ParseInputOptions,
): Promise<ParseInputResponse> {
  if (!isOpenAiUsable()) {
    return parseInputLocally(options);
  }

  try {
    return await parseInputWithOpenAI(options);
  } catch {
    return parseInputLocally(options);
  }
}

export function sanitizeInboundText(text: string): { accepted: boolean; text: string } {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) {
    return { accepted: false, text: trimmed };
  }
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(trimmed)) {
    return { accepted: false, text: trimmed };
  }
  return { accepted: true, text: trimmed };
}

export function estimateAudioSeconds(buffer: Buffer): number {
  return Math.max(1, Math.ceil(buffer.length / 16_000));
}

export interface NotebookOcrResult {
  extractedText: string;
  metadata: NotebookOcrMetadata;
  imageMimeType: string;
}

async function prepareNotebookImageForVision(
  image: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; dataUrl: string }> {
  const safeMime = mimeType.startsWith("image/") ? mimeType.split(";")[0]! : "image/jpeg";
  const base64 = image.toString("base64");
  return {
    buffer: image,
    mimeType: safeMime,
    dataUrl: `data:${safeMime};base64,${base64}`,
  };
}

/** Phase A: GPT-4o — verbatim image transcription. */
export async function transcribeNotebookImageVision(
  image: Buffer,
  mimeType: string,
): Promise<{ rawTranscription: string; imageMimeType: string }> {
  const client = openaiClient();
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
  const prepared = await prepareNotebookImageForVision(image, mimeType);

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
            image_url: { url: prepared.dataUrl, detail: "auto" },
          },
        ],
      },
    ],
  });

  const rawTranscription = completion.choices[0]?.message?.content?.trim();
  if (!rawTranscription) {
    throw new Error("Vision model returned empty transcription");
  }

  return { rawTranscription, imageMimeType: prepared.mimeType };
}

/** Phase B: GPT-4o-mini — linguistic proofreading of OCR text. */
export async function refineNotebookTranscription(rawTranscription: string): Promise<string> {
  const trimmed = rawTranscription.trim();
  if (!trimmed) {
    throw new Error("Cannot refine empty transcription");
  }

  const client = openaiClient();
  const model = process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: notebookLinguisticEditPrompt },
      { role: "user", content: trimmed },
    ],
  });

  const corrected = completion.choices[0]?.message?.content?.trim();
  if (!corrected) {
    throw new Error("Language model returned empty corrected transcription");
  }

  return corrected;
}

/** Vision pipeline: GPT-4o OCR → GPT-4o-mini proofread. */
export async function processNotebookOcr(
  image: Buffer,
  mimeType: string,
): Promise<NotebookOcrResult> {
  if (!isOpenAiUsable()) {
    throw new Error("OpenAI is not configured for notebook OCR");
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
