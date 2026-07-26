import type { ParsedItem } from "../../types/ai.js";
import {
  trySplitTopicActions,
  topicActionsToSegments,
} from "./topicTaskSplit.js";

/** Clause that schedules or advances the *same* task — not a new one. */
const TASK_CONTINUATION_LEAD =
  /^(?:לקדם|לקדש|לטפל|לעבוד|לעבד|להתחיל|לשבת|לדון|לתכנן|לסגור|לסיים|לדחות|להזיז)(?:\s+(?:את|על)\s+זה)?/iu;

const NEEDS_CONTINUATION =
  /^צריך\s+ל(?!עשות\b)[\u0590-\u05FF'-]/iu;

const SCHEDULE_ONLY =
  /^(?:בתחילת|בסוף|באמצע|עד\s+סוף|עד\s+יום)/iu;

export function isTaskContinuationClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (!trimmed) return false;
  if (TASK_CONTINUATION_LEAD.test(trimmed)) return true;
  if (NEEDS_CONTINUATION.test(trimmed)) return true;
  if (/^(?:את|על)\s+זה\b/iu.test(trimmed)) return true;
  if (SCHEDULE_ONLY.test(trimmed) && trimmed.length < 80) return true;
  return false;
}

function shouldSplitAtComma(afterComma: string): boolean {
  const after = afterComma.trimStart();
  if (!after) return false;
  if (isTaskContinuationClause(after)) return false;

  if (/^(?:ו?גם\s+)?תזכיר/iu.test(after)) return true;
  if (/^(?:ו?גם\s+)?(?:קוד|הקוד|הסיסמה|והסיסמה)\b/iu.test(after)) return true;
  if (/^(?:ו?גם\s+)?ל[\u0590-\u05FF]/u.test(after)) return true;
  if (/^(?:וגם|גם)\s+/iu.test(after)) return true;
  if (/^ו(?=תזכיר|גם\s)/u.test(after)) return true;
  return false;
}

function splitCommaInChunk(text: string): string[] {
  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ",") continue;

    const after = text.slice(i + 1);
    if (!shouldSplitAtComma(after)) continue;

    const segment = text.slice(start, i).trim();
    if (segment.length >= 2) parts.push(segment);

    start = i + 1;
    while (start < text.length && /\s/.test(text[start]!)) start += 1;
    i = start - 1;
  }

  const tail = text.slice(start).trim();
  if (tail.length >= 2) parts.push(tail);
  return parts.length > 0 ? parts : [text.trim()];
}

/** Voice / free-form: "לקנות חלב וגם לשלוח מייל וגם להתקשר" */
function splitConjunctionBoundaries(text: string): string[] {
  const segments = text
    .split(/\s+(?:וגם|ואז|ו(?=תזכיר|גם\s))\s+/iu)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);
  return segments.length > 0 ? segments : [text.trim()];
}

/** Separate sentences that each look like their own task/note. */
function splitSentenceBoundaries(text: string): string[] {
  const rough = text
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.replace(/[.!?…]+$/u, "").trim())
    .filter((part) => part.length >= 2);

  if (rough.length < 2) return [text.trim()];

  const actionableLead =
    /^(?:תזכיר(?:י)?\s+לי\s+)?(?:ו?גם\s+)?(?:ל|לה)[\u0590-\u05FF]/u;
  const actionish = rough.filter((part) => actionableLead.test(part));
  if (actionish.length < 2) return [text.trim()];
  return rough;
}

/** Split compound capture into independent thoughts — keep one task when comma continues planning. */
export function splitInputSegments(
  text: string,
  allowedTags?: string[],
): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const topicSplit = trySplitTopicActions(normalized, allowedTags);
  if (topicSplit && topicSplit.actions.length >= 2) {
    return topicActionsToSegments(topicSplit);
  }

  const hardParts = normalized
    .split(/\n\s*\n+|\s*;\s*/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  const chunks = hardParts.length > 0 ? hardParts : [normalized];
  const segments: string[] = [];

  for (const chunk of chunks) {
    for (const sentence of splitSentenceBoundaries(chunk)) {
      for (const conj of splitConjunctionBoundaries(sentence)) {
        segments.push(...splitCommaInChunk(conj));
      }
    }
  }

  return segments.length > 0 ? segments : [normalized];
}

function itemPrimaryText(item: ParsedItem): string {
  return `${item.title} ${item.content}`.replace(/\s+/g, " ").trim();
}

export function shouldMergeContinuationItems(
  first: ParsedItem,
  second: ParsedItem,
  sourceText: string,
): boolean {
  if (!first.is_actionable || !second.is_actionable) return false;

  const secondText = itemPrimaryText(second);
  if (isTaskContinuationClause(secondText) || isTaskContinuationClause(second.title)) {
    return true;
  }

  if (/\bזה\b/u.test(secondText) && secondText.length < sourceText.length * 0.65) {
    return true;
  }

  return false;
}

function combineParsedItems(
  first: ParsedItem,
  second: ParsedItem,
  sourceText: string,
): ParsedItem {
  const combinedText =
    sourceText.trim() ||
    [first.title, second.title].filter(Boolean).join(", ");

  return {
    title: first.title,
    content: combinedText,
    is_actionable: true,
    due_date: second.due_date ?? first.due_date,
    tags: [...new Set([...first.tags, ...second.tags])],
    analysis: {
      ...first.analysis,
      time_mention:
        second.analysis.time_mention !== "חסר"
          ? second.analysis.time_mention
          : first.analysis.time_mention,
    },
  };
}

/** Merge items that are planning continuations of the same task (AI or rule split). */
export function mergeContinuationParsedItems(
  items: ParsedItem[],
  sourceText: string,
): ParsedItem[] {
  if (items.length <= 1) return items;

  const merged: ParsedItem[] = [];
  let i = 0;

  while (i < items.length) {
    let current = items[i]!;
    let j = i + 1;

    while (j < items.length && shouldMergeContinuationItems(current, items[j]!, sourceText)) {
      current = combineParsedItems(current, items[j]!, sourceText);
      j += 1;
    }

    merged.push(current);
    i = j;
  }

  return merged;
}
