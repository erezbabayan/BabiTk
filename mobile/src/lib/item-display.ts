import { getItemAnalysis, type StoredItemAnalysis } from "./item-analysis";
import {
  effectiveTaskDueDate,
  formatReminderRecurrenceLabel,
  getReminderFlags,
  getReminderRecurrence,
} from "./resolve-item-reminder";

/** Minimal item shape for card display (MindtaskerItem-compatible). */
export interface ItemDisplaySource {
  title: string;
  content: string;
  tags: string[];
  is_actionable: boolean;
  due_date: string | null;
  metadata?: Record<string, unknown> | null | undefined;
}

export const HEADLINE_MAX_WORDS = 8;
export const HEADLINE_COLLAPSED_MAX_LINES = 2;
/** Approx. chars visible across two headline lines at card font size. */
export const HEADLINE_COLLAPSE_CHAR_THRESHOLD = 88;
export const BODY_COLLAPSE_CHAR_THRESHOLD = 72;
/** Minimum card height when collapsed with expandable body (px). */
export const ITEM_CARD_COLLAPSED_MIN_HEIGHT_PX = 76;
/** Max content area height when collapsed (px). */
export const ITEM_CARD_COLLAPSED_CONTENT_MAX_PX = 40;

/** Item card text — matches list row title size on mobile. */
export const ITEM_HEADLINE_FONT_SIZE = 13;
export const ITEM_BODY_FONT_SIZE = 13;
export const TASK_LIST_TITLE_FONT_SIZE = 13;

export function itemCardMinHeight(
  display: ItemDisplayFields,
  itemExpanded: boolean,
): number | undefined {
  if (itemExpanded) return undefined;
  if (!display.isItemExpandable) return undefined;
  return display.body ? ITEM_CARD_COLLAPSED_MIN_HEIGHT_PX : undefined;
}

export function isItemContentCollapsed(
  isItemExpandable: boolean,
  itemExpanded: boolean,
): boolean {
  return isItemExpandable && !itemExpanded;
}

export interface ItemDisplayFields {
  headline: string;
  fullHeadline: string;
  body: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  reminderLabel: string | null;
  /** Daily / weekly / … when reminder_recurrence is set. */
  recurrenceLabel: string | null;
  tags: string[];
  isNote: boolean;
  isHeadlineTruncated: boolean;
  isBodyExpandable: boolean;
  isItemExpandable: boolean;
  reminderActive: boolean;
}

export function truncateHeadline(text: string, maxWords = HEADLINE_MAX_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function itemBodyText(item: ItemDisplaySource): string | null {
  const title = item.title.trim();
  const content = item.content.trim();
  if (!content || content === title) return null;
  return content;
}

export function resolveFullHeadline(item: ItemDisplaySource): string {
  const title = item.title.trim();
  if (title) return title;
  const content = item.content.trim();
  if (content) return content;
  return "ללא שם";
}

export function isHeadlineTruncated(item: ItemDisplaySource): boolean {
  const full = resolveFullHeadline(item);
  const lines = full
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > HEADLINE_COLLAPSED_MAX_LINES) return true;
  return full.length > HEADLINE_COLLAPSE_CHAR_THRESHOLD;
}

export function resolveHeadline(item: ItemDisplaySource): string {
  return truncateHeadline(resolveFullHeadline(item));
}

export function isBodyExpandable(body: string | null): boolean {
  if (!body) return false;
  return body.length > BODY_COLLAPSE_CHAR_THRESHOLD || body.includes("\n");
}

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatItemDate(iso: string | null | undefined): string | null {
  const d = parseIso(iso);
  if (!d) return null;
  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export function formatItemTime(iso: string | null | undefined): string | null {
  const d = parseIso(iso);
  if (!d) return null;
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatItemReminder(iso: string | null | undefined): string | null {
  const d = parseIso(iso);
  if (!d) return null;
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveScheduleIso(
  item: ItemDisplaySource,
  analysis: StoredItemAnalysis | null,
): string | null {
  const manualDue = effectiveTaskDueDate(item);
  if (!item.is_actionable) {
    return manualDue;
  }
  return manualDue ?? analysis?.target_at ?? null;
}

/** True when the item has a scheduled reminder (snooze / due date / notify). */
export function isReminderActive(item: ItemDisplaySource): boolean {
  if (getReminderFlags(item.metadata).disabled) return false;
  if (effectiveTaskDueDate(item)) return true;
  if (!item.is_actionable) return false;
  const analysis = getItemAnalysis(item.metadata);
  return Boolean(analysis?.notify_at);
}

export function buildItemDisplayFields(item: ItemDisplaySource): ItemDisplayFields {
  const analysis = getItemAnalysis(item.metadata);
  const body = itemBodyText(item);
  const scheduleIso = resolveScheduleIso(item, analysis);
  const fullHeadline = resolveFullHeadline(item);
  const headlineTruncated = isHeadlineTruncated(item);
  const bodyExpandable = isBodyExpandable(body);

  const recurrenceLabel = formatReminderRecurrenceLabel(
    getReminderRecurrence(item.metadata),
  );

  return {
    headline: truncateHeadline(fullHeadline),
    fullHeadline,
    body,
    dateLabel: formatItemDate(scheduleIso),
    timeLabel: formatItemTime(scheduleIso),
    reminderLabel: (() => {
      const base = item.is_actionable
        ? formatItemReminder(analysis?.notify_at)
        : formatItemReminder(effectiveTaskDueDate(item));
      if (!base) return recurrenceLabel ? `חוזרת · ${recurrenceLabel}` : null;
      if (!recurrenceLabel) return base;
      return `${base} · ${recurrenceLabel}`;
    })(),
    recurrenceLabel,
    tags: item.tags ?? [],
    isNote: !item.is_actionable,
    isHeadlineTruncated: headlineTruncated,
    isBodyExpandable: bodyExpandable,
    isItemExpandable: headlineTruncated || bodyExpandable,
    reminderActive: isReminderActive(item),
  };
}

const META_BULLET = " • ";

/** Date • time line for the schedule slot on the footer right (RTL). */
export function buildItemScheduleLine(display: ItemDisplayFields): string | null {
  const parts: string[] = [];
  if (display.dateLabel) parts.push(display.dateLabel);
  if (display.timeLabel) parts.push(display.timeLabel);
  if (display.recurrenceLabel) parts.push(display.recurrenceLabel);
  if (parts.length > 0) return parts.join(META_BULLET);
  if (display.reminderLabel) return `תזכורת ${display.reminderLabel}`;
  return null;
}

/** Bullet-separated metadata line (listing-card style). */
export function buildItemMetaLine(display: ItemDisplayFields): string {
  const parts: string[] = [];
  if (display.dateLabel) parts.push(display.dateLabel);
  if (display.timeLabel) parts.push(display.timeLabel);
  if (display.reminderLabel) parts.push(`תזכורת ${display.reminderLabel}`);
  else if (display.recurrenceLabel) parts.push(`חוזרת · ${display.recurrenceLabel}`);
  return parts.join(META_BULLET);
}

/** Split body into preview lines for typographic hierarchy. */
export function splitBodyPreview(body: string): { primary: string; secondary: string | null } {
  const lines = body
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { primary: body.trim(), secondary: null };
  if (lines.length === 1) {
    const words = lines[0].split(/\s+/);
    if (words.length <= 12) return { primary: lines[0], secondary: null };
    return {
      primary: words.slice(0, 8).join(" "),
      secondary: words.slice(8).join(" "),
    };
  }
  return { primary: lines[0], secondary: lines.slice(1).join(" ") };
}

/** Task list row shows struck-through text when archived (or legacy completed) on the board. */
export function isTaskListDone(item: { status: string }): boolean {
  return item.status === "snoozed_archive" || item.status === "completed";
}

export function isTaskListDeleted(item: { deleted_at?: string | null }): boolean {
  return Boolean(item.deleted_at);
}

/** Strikethrough in task lists — archived, completed, or soft-deleted. */
export function isTaskListStruck(item: { status: string; deleted_at?: string | null }): boolean {
  return isTaskListDeleted(item) || isTaskListDone(item);
}
