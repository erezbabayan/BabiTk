import type { ParsedItem, ParseInputResponse } from "../types/ai.js";
import {
  resolveDueDateFromText,
  stripTemporalPhrases,
} from "./hebrew-date-resolver.service.js";
import { normalizeDueDateIso } from "../utils/timezone.js";

const FILLER_PREFIX =
  /^(?:תזכיר לי|תזכירי לי|שים לב|שימי לב|אמ+|אה+|שומע|שומעת|כאילו|בעצם)[,\s]*/iu;

const DEFAULT_NOTE_TAGS = ["מידע"];
const DEFAULT_TASK_TAGS = ["כללי"];

export interface EntityRulesOptions {
  allowedTags?: string[];
  timezone?: string;
  referenceDate?: Date;
  sourceText?: string;
}

/**
 * Enforces MindTasker entity separation after AI parsing:
 * - Task  (is_actionable=true)  → may have due_date, action-oriented title
 * - Note  (is_actionable=false) → due_date always null, reference content
 */
export function enforceEntityRules(
  item: ParsedItem,
  options?: EntityRulesOptions,
): ParsedItem {
  const timezone = options?.timezone ?? "Asia/Jerusalem";
  const content = item.content.trim();
  const allowedTags = options?.allowedTags;
  const noteFallback = pickFallback(allowedTags, DEFAULT_NOTE_TAGS);
  const taskFallback = pickFallback(allowedTags, DEFAULT_TASK_TAGS);

  if (!item.is_actionable) {
    return {
      title: cleanTitle(item.title),
      content: content || cleanTitle(item.title),
      is_actionable: false,
      due_date: null,
      tags: normalizeTags(item.tags, noteFallback, allowedTags),
      analysis: {
        ...item.analysis,
        task: "חסר",
      },
    };
  }

  const due_date = resolveTaskDueDate(item, options);
  let title = cleanTitle(item.title);
  if (due_date) {
    title = cleanTitle(stripTemporalPhrases(title));
  }

  const analysis = { ...item.analysis };
  if (analysis.task === "חסר" && (title || item.title).trim()) {
    analysis.task = (title || item.title).trim();
  }

  return {
    title: title || cleanTitle(item.title),
    content,
    is_actionable: true,
    due_date,
    tags: normalizeTags(item.tags, taskFallback, allowedTags),
    analysis,
  };
}

export function enforceIngestionRules(
  response: ParseInputResponse,
  options?: EntityRulesOptions,
): ParseInputResponse {
  return {
    items: response.items.map((item) => enforceEntityRules(item, options)),
  };
}

function resolveTaskDueDate(
  item: ParsedItem,
  options?: EntityRulesOptions,
): string | null {
  const timezone = options?.timezone ?? "Asia/Jerusalem";
  const resolveOptions = {
    timezone,
    referenceDate: options?.referenceDate,
  };

  const normalized = normalizeDueDateIso(item.due_date, timezone);
  if (normalized) {
    return normalized;
  }

  const itemText = `${item.title} ${item.content}`.trim();
  const fromItem = resolveDueDateFromText(itemText, resolveOptions);
  if (fromItem) {
    return fromItem;
  }

  if (options?.sourceText && options.sourceText !== itemText) {
    return resolveDueDateFromText(options.sourceText, resolveOptions);
  }

  return null;
}

function pickFallback(allowedTags: string[] | undefined, defaults: string[]): string[] {
  if (!allowedTags || allowedTags.length === 0) {
    return defaults;
  }

  const preferred = defaults
    .map((tag) => mapToAllowedTag(tag, allowedTags))
    .filter((tag): tag is string => Boolean(tag));

  return preferred.length > 0 ? preferred : [allowedTags[0]!];
}

function cleanTitle(title: string): string {
  return title.replace(FILLER_PREFIX, "").replace(/\s+/g, " ").trim();
}

function normalizeTags(
  tags: string[],
  fallback: string[],
  allowedTags?: string[],
): string[] {
  const cleaned = tags
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);

  const mapped = allowedTags?.length
    ? cleaned
        .map((tag) => mapToAllowedTag(tag, allowedTags))
        .filter((tag): tag is string => Boolean(tag))
    : cleaned;

  const unique = [...new Set(mapped)].slice(0, 3);
  return unique.length > 0 ? unique : fallback.slice(0, 1);
}

function mapToAllowedTag(tag: string, allowedTags: string[]): string | null {
  const exact = allowedTags.find((allowed) => allowed === tag);
  if (exact) return exact;

  const lower = tag.toLowerCase();
  const caseInsensitive = allowedTags.find(
    (allowed) => allowed.toLowerCase() === lower,
  );
  if (caseInsensitive) return caseInsensitive;

  const partial = allowedTags.find(
    (allowed) =>
      allowed.includes(tag) ||
      tag.includes(allowed) ||
      allowed.toLowerCase().includes(lower) ||
      lower.includes(allowed.toLowerCase()),
  );
  return partial ?? null;
}

export function describeEntity(item: ParsedItem): "task" | "note" {
  return item.is_actionable ? "task" : "note";
}

/**
 * Every ingested item lands in the notebook (inbox) for user triage.
 * `is_actionable` drives task vs note styling in the inbox UI.
 */
export function resolveIngestItemStatus(_item: ParsedItem): "inbox" {
  return "inbox";
}
