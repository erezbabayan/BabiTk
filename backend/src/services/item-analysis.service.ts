import type { ParsedItem } from "../types/ai.js";
import type { SourceType } from "../types/database.js";
import {
  SOURCE_TYPE_LABELS,
  type ParsedItemAnalysis,
  type StoredItemAnalysis,
  type UrgencyLevel,
  URGENCY_LEVELS,
} from "../types/item-analysis.js";

const MISSING = "חסר";
const DEFAULT_TIMEZONE = "Asia/Jerusalem";

const HIGH_URGENCY_PATTERN =
  /(?:דחוף|דחופה|דחיפות|בהקדם|asap|urgent|עכשיו|מיד|חייב|חייבת)/iu;
const LOW_URGENCY_PATTERN =
  /(?:לא\s*דחוף|לא\s*דחופה|כשיהיה\s*זמן|מתי\s*שאפשר|אפשר\s*לדחות)/iu;

export interface EnrichAnalysisOptions {
  sourceType: SourceType;
  sourceText?: string;
  timezone?: string;
  referenceDate?: Date;
}

export function buildFormattedAnalysis(analysis: StoredItemAnalysis): string {
  const lines = [
    `מטרה: ${analysis.goal}`,
    `מקור_מידע: ${analysis.source}`,
    `נתונים: ${analysis.data_points}`,
    `משימה: ${analysis.task}`,
    `רמת_דחיפות: ${analysis.urgency}`,
    `איזכור_זמן: ${analysis.time_mention}`,
    `מועד_יעד: ${analysis.target_at ? formatIsoHebrew(analysis.target_at) : MISSING}`,
    `מועד_התראה: ${analysis.notify_at ? formatIsoHebrew(analysis.notify_at) : MISSING}`,
  ];
  return lines.join("\n");
}

export function enrichParsedItemsWithAnalysis(
  items: ParsedItem[],
  options: EnrichAnalysisOptions,
): ParsedItem[] {
  const source = SOURCE_TYPE_LABELS[options.sourceType];
  return items.map((item) => enrichSingleItemAnalysis(item, { ...options, source }));
}

function enrichSingleItemAnalysis(
  item: ParsedItem,
  options: EnrichAnalysisOptions & { source: string },
): ParsedItem {
  const analysis = normalizeAnalysisFields(item.analysis, item, options);
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const referenceDate = options.referenceDate ?? new Date();
  const target_at = item.is_actionable ? item.due_date : null;
  const notify_at = computeNotifyAt(target_at, analysis.urgency, timezone, referenceDate);

  const stored: StoredItemAnalysis = {
    ...analysis,
    source: options.source,
    target_at,
    notify_at,
    formatted: "",
  };
  stored.formatted = buildFormattedAnalysis(stored);

  return {
    ...item,
    analysis: stored,
  };
}

export function computeNotifyAt(
  targetAt: string | null,
  urgency: UrgencyLevel,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!targetAt) return null;

  const due = new Date(targetAt);
  if (Number.isNaN(due.getTime())) return null;

  let notify: Date;

  switch (urgency) {
    case "גבוהה":
      notify = new Date(due.getTime() - 30 * 60 * 1000);
      break;
    case "בינונית":
      notify = new Date(due.getTime() - 2 * 60 * 60 * 1000);
      break;
    case "נמוכה":
      notify = morningBeforeDue(due, timezone);
      break;
    default:
      notify = new Date(due.getTime() - 60 * 60 * 1000);
      break;
  }

  const minNotify = new Date(referenceDate.getTime() + 2 * 60 * 1000);
  if (notify.getTime() < minNotify.getTime()) {
    notify = minNotify;
  }

  if (notify.getTime() >= due.getTime()) {
    return null;
  }

  return notify.toISOString();
}

function morningBeforeDue(due: Date, timezone: string): Date {
  const dueParts = getZonedParts(due, timezone);
  const dayBefore = new Date(Date.UTC(dueParts.year, dueParts.month - 1, dueParts.day - 1));
  const parts = getZonedParts(dayBefore, timezone);
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 9, 0, timezone);
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = getZonedParts(guess, timezone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const diffMs = wanted - asUtc;
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }
  return guess;
}

function normalizeAnalysisFields(
  raw: ParsedItemAnalysis,
  item: ParsedItem,
  options: EnrichAnalysisOptions,
): ParsedItemAnalysis {
  const goal = sanitizeField(raw.goal);
  let data_points = sanitizeField(raw.data_points);
  let task = sanitizeField(raw.task);
  let urgency = normalizeUrgency(raw.urgency);
  let time_mention = sanitizeField(raw.time_mention);

  if (!item.is_actionable) {
    task = MISSING;
  } else if (task === MISSING) {
    task = item.title.trim() || MISSING;
  }

  const contextText = [options.sourceText, item.title, item.content].filter(Boolean).join(" ");
  urgency = resolveUrgency(urgency, contextText, item.due_date, options.referenceDate);

  const normalized: ParsedItemAnalysis = {
    goal: goal === "" ? MISSING : goal,
    data_points: data_points === "" ? MISSING : data_points,
    task,
    urgency,
    time_mention: time_mention === "" ? MISSING : time_mention,
  };

  if (item.is_actionable && item.due_date) {
    return dropRedundantRelativeTime(normalized);
  }

  return normalized;
}

/** When a concrete due date exists, drop relative phrases like "מחר" from stored analysis. */
function dropRedundantRelativeTime(analysis: ParsedItemAnalysis): ParsedItemAnalysis {
  let data_points = analysis.data_points.replace(/\s*;\s*מועד\s*:\s*[^;]+/giu, "").trim();
  if (data_points === "") {
    data_points = MISSING;
  }

  return {
    ...analysis,
    data_points,
    time_mention: MISSING,
  };
}

function sanitizeField(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeUrgency(value: string): UrgencyLevel {
  const trimmed = value.trim();
  if ((URGENCY_LEVELS as readonly string[]).includes(trimmed)) {
    return trimmed as UrgencyLevel;
  }
  return MISSING;
}

function resolveUrgency(
  current: UrgencyLevel,
  contextText: string,
  dueDate: string | null,
  referenceDate?: Date,
): UrgencyLevel {
  if (current !== MISSING) {
    return current;
  }

  if (HIGH_URGENCY_PATTERN.test(contextText)) {
    return "גבוהה";
  }

  if (LOW_URGENCY_PATTERN.test(contextText)) {
    return "נמוכה";
  }

  if (dueDate && referenceDate) {
    const due = new Date(dueDate);
    const ref = referenceDate;
    const dueDay = startOfLocalDay(due);
    const refDay = startOfLocalDay(ref);
    const diffDays = Math.round((dueDay.getTime() - refDay.getTime()) / 86_400_000);

    if (diffDays <= 0) {
      return "גבוהה";
    }
    if (diffDays === 1) {
      return "בינונית";
    }
  }

  return MISSING;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatIsoHebrew(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function extractAnalysisMetadata(
  item: ParsedItem,
): Record<string, unknown> | undefined {
  if (!item.analysis || !("formatted" in item.analysis)) {
    return undefined;
  }
  return { analysis: item.analysis };
}
