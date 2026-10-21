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

/**
 * Short captures already covered by the local rule parser.
 * Multi-line notes still go to the model when a key is configured.
 */
export function shouldUseLocalParseFastPath(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 400) return false;
  const lineBreaks = trimmed.match(/\n/g)?.length ?? 0;
  if (lineBreaks > 2) return false;
  if (/[?？]/.test(trimmed)) return false;
  return true;
}

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
  const fastPath = shouldUseLocalParseFastPath(lexiconFixed);
  const correctedText =
    isOpenAiUsable() && !fastPath
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

  if (!isOpenAiUsable() || fastPath) {
    return enforceIngestionRules(parseInputLocally(normalizedOptions), ruleOptions);
  }

  try {
    return await parseInputWithAI(normalizedOptions);
  } catch {
    return enforceIngestionRules(parseInputLocally(normalizedOptions), ruleOptions);
  }
}
