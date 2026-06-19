import OpenAI from "openai";
import { env } from "../config/env.js";
import {
  buildNluExtractSystemPrompt,
  nluExtractJsonSchema,
} from "../prompts/nlu-extract.prompt.js";
import { nluTaskPayloadSchema, type NluTaskPayload } from "../types/nlu-task.js";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

export async function extractNluTaskFromTranscription(
  transcription: string,
  options?: { timezone?: string; referenceDate?: Date },
): Promise<NluTaskPayload> {
  const timezone = options?.timezone ?? "Asia/Jerusalem";
  const referenceDate = options?.referenceDate ?? new Date();
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
    temperature: 0.1,
    messages: [
      { role: "system", content: buildNluExtractSystemPrompt(referenceIso, timezone) },
      { role: "user", content: transcription },
    ],
    response_format: {
      type: "json_schema",
      json_schema: nluExtractJsonSchema,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("NLU extractor returned empty response");
  }

  const raw = JSON.parse(content) as {
    task: string;
    context: string[];
    reminder_datetime: string | null;
    original_transcription: string;
  };

  return nluTaskPayloadSchema.parse({
    task: raw.task,
    context: raw.context,
    reminder_datetime: raw.reminder_datetime ?? undefined,
    original_transcription: raw.original_transcription || transcription,
  });
}
