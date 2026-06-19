import OpenAI from "openai";
import { toFile } from "openai/uploads";
import {
  enforceIngestionRules,
} from "./entity-rules.service.js";
import { env } from "../config/env.js";
import { resizeImageForOcr } from "../utils/image-resize.js";
import { notebookVisionTranscriptionPrompt, notebookLinguisticEditPrompt } from "../prompts/notebook-ocr.prompt.js";
import {
  type NotebookOcrMetadata,
  type OcrLine,
} from "../types/notebook-ocr.js";
import {
  buildParseInputSystemPrompt,
  buildParseInputJsonSchema,
} from "../prompts/parse-input.prompt.js";
import {
  type ParseInputOptions,
  type ParseInputResponse,
  parseInputResponseSchema,
} from "../types/ai.js";
import { getTimezoneOffset } from "../utils/timezone.js";

const openai = new OpenAI({
  apiKey: env.openaiApiKey,
});

export interface TranscribeAudioResult {
  text: string;
  durationSeconds: number;
}

export interface NotebookOcrResult {
  extractedText: string;
  ocrLines: OcrLine[];
  metadata: NotebookOcrMetadata;
  imageBuffer: Buffer;
  imageMimeType: string;
}

function normalizeParsedResponse(
  raw: ParseInputResponse,
  options: {
    allowedTags?: string[];
    timezone: string;
    referenceDate: Date;
    sourceText: string;
  },
): ParseInputResponse {
  return enforceIngestionRules(raw, {
    allowedTags: options.allowedTags,
    timezone: options.timezone,
    referenceDate: options.referenceDate,
    sourceText: options.sourceText,
  });
}

export async function parseInputWithAI(
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

  const completion = await openai.chat.completions.create({
    model: env.openaiParseModel,
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

  const validated = parseInputResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `AI response failed schema validation: ${validated.error.message}`,
    );
  }

  return normalizeParsedResponse(validated.data, {
    allowedTags: options.allowedTags,
    timezone,
    referenceDate,
    sourceText: options.text.trim(),
  });
}

export async function transcribeAudio(
  audio: Buffer,
  fileName: string,
  mimeType = "audio/ogg",
): Promise<TranscribeAudioResult> {
  const file = await toFile(audio, fileName, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: env.openaiWhisperModel,
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

export interface NotebookVisionTranscriptionResult {
  rawTranscription: string;
  imageBuffer: Buffer;
  imageMimeType: string;
}

async function prepareNotebookImageForVision(
  image: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; dataUrl: string }> {
  const resized = await resizeImageForOcr(
    image,
    mimeType,
    env.ocrMaxWidth,
    env.ocrMaxHeight,
    env.ocrJpegQuality,
  );
  const base64 = resized.buffer.toString("base64");
  return {
    buffer: resized.buffer,
    mimeType: resized.mimeType,
    dataUrl: `data:${resized.mimeType};base64,${base64}`,
  };
}

/** Phase A: Vision LLM — verbatim transcription, no spelling fixes, ? for unclear words. */
export async function transcribeNotebookImageVision(
  image: Buffer,
  mimeType: string,
): Promise<NotebookVisionTranscriptionResult> {
  const prepared = await prepareNotebookImageForVision(image, mimeType);

  const completion = await openai.chat.completions.create({
    model: env.openaiVisionModel,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: notebookVisionTranscriptionPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: prepared.dataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const rawTranscription = completion.choices[0]?.message?.content?.trim();
  if (!rawTranscription) {
    throw new Error("Vision model returned empty transcription");
  }

  return {
    rawTranscription,
    imageBuffer: prepared.buffer,
    imageMimeType: prepared.mimeType,
  };
}

/** Phase B: NLP proofreading — fix OCR artifacts without changing author intent. */
export async function refineNotebookTranscription(
  rawTranscription: string,
): Promise<string> {
  const trimmed = rawTranscription.trim();
  if (!trimmed) {
    throw new Error("Cannot refine empty transcription");
  }

  const completion = await openai.chat.completions.create({
    model: env.openaiParseModel,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: notebookLinguisticEditPrompt,
      },
      {
        role: "user",
        content: trimmed,
      },
    ],
  });

  const corrected = completion.choices[0]?.message?.content?.trim();
  if (!corrected) {
    throw new Error("Language model returned empty corrected transcription");
  }

  return corrected;
}

export async function processNotebookOCR(
  image: Buffer,
  mimeType: string,
): Promise<NotebookOcrResult> {
  const { rawTranscription, imageBuffer, imageMimeType } =
    await transcribeNotebookImageVision(image, mimeType);

  const correctedTranscription = await refineNotebookTranscription(rawTranscription);

  const metadata: NotebookOcrMetadata = {
    raw_transcription: rawTranscription,
    corrected_transcription: correctedTranscription,
  };

  return {
    extractedText: correctedTranscription,
    ocrLines: [],
    metadata,
    imageBuffer,
    imageMimeType,
  };
}
