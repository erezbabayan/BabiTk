import type { ParseInputOptions, ParseInputResponse } from "./types";
import { parseInputLocally } from "./localParse";

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

export function parseInputForIngestLocally(
  options: ParseInputOptions,
): ParseInputResponse {
  return parseInputLocally(options);
}
