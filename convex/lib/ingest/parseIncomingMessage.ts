import { correctEnglishKeyboardHebrew } from "./englishKeyboardHebrew";
import { parseInputLocally } from "./localParse";
import { DEFAULT_TAG_NAMES } from "./defaultTags";
import type { ParsedItem } from "./types";

export const CONTEXT_PARSED_AT_KEY = "context_parsed_at";

export interface ParseIncomingOptions {
  allowedTags?: string[];
  timezone?: string;
  locale?: string;
  now?: Date;
}

/** Parse a new inbound message into items with context tags, dates, and type. */
export function parseIncomingMessage(
  text: string,
  options: ParseIncomingOptions = {},
): ParsedItem[] {
  const trimmed = correctEnglishKeyboardHebrew(text.trim());
  if (!trimmed) return [];

  const parsed = parseInputLocally({
    text: trimmed,
    timezone: options.timezone ?? "Asia/Jerusalem",
    locale: options.locale ?? "he-IL",
    referenceDate: options.now ?? new Date(),
    allowedTags: options.allowedTags?.length ? options.allowedTags : DEFAULT_TAG_NAMES,
  });

  return parsed.items.filter((item) => item.title.trim() || item.content.trim());
}

export function incomingParseMetadata(
  item: ParsedItem,
  extra: Record<string, unknown> = {},
  now = new Date(),
): Record<string, unknown> {
  return {
    ...extra,
    analysis: item.analysis,
    [CONTEXT_PARSED_AT_KEY]: now.toISOString(),
  };
}

export function parsedItemInsertFields(
  item: ParsedItem,
  extraMeta: Record<string, unknown> = {},
  now = new Date(),
): {
  title: string;
  content: string;
  is_actionable: boolean;
  due_date: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
} {
  return {
    title: item.title.trim() || item.content.trim().slice(0, 120) || "פריט חדש",
    content: item.content.trim() || item.title.trim(),
    is_actionable: item.is_actionable,
    due_date: item.is_actionable ? item.due_date : null,
    tags: item.tags,
    metadata: incomingParseMetadata(item, extraMeta, now),
  };
}
