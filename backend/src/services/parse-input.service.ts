import type { ParseInputOptions, ParseInputResponse } from "../types/ai.js";
import { parseInputLocally } from "./local-parse.service.js";
import {
  parseInputWithAI,
  proofreadHebrewInboundText,
} from "./openai.service.js";
import { enforceIngestionRules } from "./entity-rules.service.js";
import { correctEnglishKeyboardHebrew } from "../lib/ingest/englishKeyboardHebrew.js";
import { applyHebrewAsrSpellingFixes } from "../lib/ingest/hebrewAsrSpelling.js";

const PLACEHOLDER_KEY_MARKERS = [
  "placeholder",
  "your-api-key",
  "changeme",
  "sk-dev-",
  "sk-...",
];

export function isOpenAiUsable(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (key.length < 20) return false;

  const lowered = key.toLowerCase();
  return !PLACEHOLDER_KEY_MARKERS.some((marker) => lowered.includes(marker));
}

export async function parseInputForIngest(
  options: ParseInputOptions,
): Promise<ParseInputResponse> {
  const timezone = options.timezone ?? "Asia/Jerusalem";
  const referenceDate = options.referenceDate ?? new Date();
  const keyboardFixed = correctEnglishKeyboardHebrew(options.text.trim());
  const lexiconFixed = applyHebrewAsrSpellingFixes(keyboardFixed);
  const correctedText = isOpenAiUsable()
    ? applyHebrewAsrSpellingFixes(await proofreadHebrewInboundText(lexiconFixed))
    : lexiconFixed;
  const normalizedOptions: ParseInputOptions = {
    ...options,
    text: correctedText,
  };
  const sourceText = correctedText;
  const ruleOptions = {
    allowedTags: options.allowedTags,
    timezone,
    referenceDate,
    sourceText,
  };

  if (!isOpenAiUsable()) {
    return enforceIngestionRules(parseInputLocally(normalizedOptions), ruleOptions);
  }

  try {
    return await parseInputWithAI(normalizedOptions);
  } catch {
    return enforceIngestionRules(parseInputLocally(normalizedOptions), ruleOptions);
  }
}
