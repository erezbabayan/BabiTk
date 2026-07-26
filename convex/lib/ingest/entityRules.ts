import type { ParsedItem, ParseInputResponse } from "./types";
import {
  resolveDueDateFromText,
  stripTemporalPhrases,
} from "./hebrewDates";
import {
  extractTimeOfDay,
  isConcreteClockMention,
} from "./hebrewTimeWords";
import { normalizeDueDateIso } from "./timezone";
import { mergeInferredTags } from "./tagInference";
import { DEFAULT_TAG_NAMES } from "./defaultTags";
import { normalizeTaskPresentation, deriveShortTaskTitle } from "./taskPresentation";
import { mergeContinuationParsedItems, splitInputSegments } from "./inputSegmentation";
import { trySplitTopicActions, topicActionsToSegments } from "./topicTaskSplit";
import {
  applyLearnedTagLessons,
  type IngestLesson,
} from "./ingestLearning";
import { formatStructuredNoteBody } from "./textStructure";

const FILLER_PREFIX =
  /^(?:תזכיר לי|תזכירי לי|שים לב|שימי לב|אמ+|אה+|שומע|שומעת|כאילו|בעצם)[,\s]*/iu;

const DEFAULT_NOTE_TAGS = ["מידע"];
const DEFAULT_TASK_TAGS = ["כללי"];

export interface EntityRulesOptions {
  allowedTags?: string[];
  timezone?: string;
  referenceDate?: Date;
  sourceText?: string;
  lessons?: IngestLesson[];
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
  const allowedTags = options?.allowedTags;
  const noteFallback = pickFallback(allowedTags, DEFAULT_NOTE_TAGS);
  const taskFallback = pickFallback(allowedTags, DEFAULT_TASK_TAGS);

  const inferenceText = buildInferenceText(item, options);

  if (!item.is_actionable) {
    const noteContent = formatStructuredNoteBody(
      item.content.trim() || item.title,
    );
    return {
      title: cleanTitle(item.title),
      content: noteContent || cleanTitle(item.title),
      is_actionable: false,
      due_date: null,
      tags: applyTagsWithInference(
        item.tags,
        noteFallback,
        allowedTags,
        inferenceText,
        options?.lessons,
      ),
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

  let content = item.content.trim();
  const presentation = normalizeTaskPresentation(
    { title, content, analysis: item.analysis },
    options?.sourceText,
  );
  title = presentation.title;
  content = formatStructuredNoteBody(
    presentation.content || options?.sourceText?.trim() || item.content,
  );

  const analysis = { ...item.analysis };
  if (presentation.analysisTask) {
    analysis.task = presentation.analysisTask;
  } else if (analysis.task === "חסר" && title.trim()) {
    analysis.task = title.trim();
  }

  return {
    title: title || cleanTitle(item.title),
    content,
    is_actionable: true,
    due_date,
    tags: applyTagsWithInference(
      item.tags,
      taskFallback,
      allowedTags,
      inferenceText,
      options?.lessons,
    ),
    analysis,
  };
}

export function enforceIngestionRules(
  response: ParseInputResponse,
  options?: EntityRulesOptions,
): ParseInputResponse {
  const sourceText = options?.sourceText?.trim() ?? "";
  const expanded = expandCompoundCapture(response, sourceText, options?.allowedTags);
  const merged = mergeContinuationParsedItems(expanded.items, sourceText);
  const multi = merged.length > 1;

  return {
    items: merged.map((item) =>
      enforceEntityRules(item, {
        ...options,
        // Per-task due dates / titles when one capture became several items.
        sourceText: multi
          ? item.content?.trim() || item.title || sourceText
          : sourceText || options?.sourceText,
      }),
    ),
  };
}

/**
 * If AI collapsed several tasks into one item, re-split using the same
 * local segmentation used for voice / typed / WhatsApp capture.
 */
function expandCompoundCapture(
  response: ParseInputResponse,
  sourceText: string,
  allowedTags?: string[],
): ParseInputResponse {
  if (!sourceText || response.items.length !== 1) return response;

  const topicSplit = trySplitTopicActions(sourceText, allowedTags);
  const segments =
    topicSplit && topicSplit.actions.length >= 2
      ? topicActionsToSegments(topicSplit)
      : splitInputSegments(sourceText, allowedTags);

  if (segments.length < 2) return response;

  const template = response.items[0]!;
  const sharedTags =
    topicSplit && topicSplit.actions.length >= 2
      ? [...new Set([...template.tags, ...topicSplit.sharedTags])]
      : template.tags;

  return {
    items: segments.map((segment) => {
      const shortTitle = deriveShortTaskTitle(segment) || segment.slice(0, 48).trim();
      const actionable = looksLikeTask(segment) || template.is_actionable;
      return {
        ...template,
        title: shortTitle,
        content: segment,
        is_actionable: actionable,
        due_date: null,
        tags: sharedTags,
        analysis: {
          ...template.analysis,
          task: actionable ? shortTitle : "חסר",
        },
      };
    }),
  };
}

function looksLikeTask(text: string): boolean {
  const t = text.trim();
  if (/^(?:תזכיר(?:י)?\s+לי\s+)?(?:ו?גם\s+)?(?:ל|לה)[\u0590-\u05FF]/u.test(t)) {
    return true;
  }
  if (/^(?:צריך|יש)\s+ל/u.test(t)) return true;
  return false;
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

  const itemText = `${item.title} ${item.content}`.trim();
  const inferenceText = buildInferenceText(item, options);
  const fromItem = resolveDueDateFromText(itemText, resolveOptions);
  const fromSource =
    options?.sourceText && options.sourceText !== itemText
      ? resolveDueDateFromText(options.sourceText, resolveOptions)
      : null;
  const fromText = fromItem ?? fromSource;
  const fromAi = normalizeDueDateIso(item.due_date, timezone);

  // Prefer Hebrew text clock ("עשר בלילה") over a vague AI default like 09:00.
  if (
    fromText &&
    isConcreteClockMention(extractTimeOfDay(inferenceText))
  ) {
    return fromText;
  }

  if (fromAi) {
    return fromAi;
  }

  if (fromText) {
    return fromText;
  }

  // Do not invent "tomorrow 09:00" for unresolved temporal hints.
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

function buildInferenceText(item: ParsedItem, options?: EntityRulesOptions): string {
  const parts = [item.title, item.content];
  if (options?.sourceText) parts.push(options.sourceText);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function applyTagsWithInference(
  itemTags: string[],
  fallback: string[],
  allowedTags: string[] | undefined,
  inferenceText: string,
  lessons?: IngestLesson[],
): string[] {
  const pool = allowedTags?.length ? allowedTags : DEFAULT_TAG_NAMES;
  const inferred = mergeInferredTags([], inferenceText, pool);
  let tags: string[];
  if (inferred.length > 0) {
    const parserTags = mergeInferredTags(itemTags, inferenceText, pool);
    tags = parserTags.length > 0 ? parserTags : inferred;
  } else {
    const normalized = normalizeTags(itemTags, fallback, pool);
    tags = mergeInferredTags(normalized, inferenceText, pool);
  }

  return applyLearnedTagLessons(tags, inferenceText, lessons ?? [], pool);
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
