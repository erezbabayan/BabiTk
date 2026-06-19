import type { ParseInputOptions, ParseInputResponse } from "../types/ai.js";
import { parseInputLocally } from "./local-parse.service.js";
import { parseInputWithAI } from "./openai.service.js";

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
  if (!isOpenAiUsable()) {
    return parseInputLocally(options);
  }

  try {
    return await parseInputWithAI(options);
  } catch {
    return parseInputLocally(options);
  }
}
