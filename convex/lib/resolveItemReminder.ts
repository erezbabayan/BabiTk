import { resolveDueDateFromText, hasTemporalHint } from "./ingest/hebrewDates";
import {
  addZonedDays,
  getZonedParts,
  normalizeDueDateIso,
  zonedLocalToIso,
} from "./ingest/timezone";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type ReminderRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

export const REMINDER_RECURRENCE_OPTIONS: Array<{
  value: ReminderRecurrence;
  label: string;
}> = [
  { value: "daily", label: "יומי" },
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
  { value: "weekdays", label: "ימי חול" },
];

export const REMINDER_RECURRENCE_LABELS: Record<ReminderRecurrence, string> = {
  daily: "יומי",
  weekly: "שבועי",
  monthly: "חודשי",
  weekdays: "ימי חול",
};

export interface ReminderFlags {
  manual: boolean;
  disabled: boolean;
}

export function getReminderFlags(metadata: unknown): ReminderFlags {
  if (!metadata || typeof metadata !== "object") {
    return { manual: false, disabled: false };
  }
  const record = metadata as Record<string, unknown>;
  return {
    manual: record.reminder_manual === true,
    disabled: record.reminder_disabled === true,
  };
}

export function getReminderRecurrence(metadata: unknown): ReminderRecurrence | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).reminder_recurrence;
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "weekdays"
  ) {
    return value;
  }
  return null;
}

export function formatReminderRecurrenceLabel(
  recurrence: ReminderRecurrence | null | undefined,
): string | null {
  if (!recurrence) return null;
  return REMINDER_RECURRENCE_LABELS[recurrence] ?? null;
}

export function patchReminderMetadata(
  metadata: unknown,
  patch: Partial<{
    manual: boolean;
    disabled: boolean;
    sent: boolean;
    recurrence: ReminderRecurrence | null;
  }>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (patch.manual !== undefined) base.reminder_manual = patch.manual;
  if (patch.disabled !== undefined) base.reminder_disabled = patch.disabled;
  if (patch.sent !== undefined) base.reminder_sent = patch.sent;
  if (patch.recurrence !== undefined) {
    if (patch.recurrence === null) {
      delete base.reminder_recurrence;
    } else {
      base.reminder_recurrence = patch.recurrence;
    }
  }
  return base;
}

function syncAnalysisFireTimes(
  metadata: Record<string, unknown>,
  dueDate: string | null,
): Record<string, unknown> {
  const analysisRaw = metadata.analysis;
  const analysis =
    analysisRaw && typeof analysisRaw === "object"
      ? { ...(analysisRaw as Record<string, unknown>) }
      : {};
  analysis.target_at = dueDate;
  analysis.notify_at = dueDate;
  return { ...metadata, analysis };
}

export function defaultTomorrowReminderIso(
  timezone = DEFAULT_TIMEZONE,
  referenceDate = new Date(),
): string {
  return addZonedDays(timezone, referenceDate, 1, 9, 0);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addZonedMonthsKeepingTime(
  timeZone: string,
  fromIso: string,
  months: number,
): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  let year = parts.year;
  let month = parts.month + months;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const day = Math.min(parts.day, daysInMonth(year, month));
  return zonedLocalToIso(
    {
      year,
      month,
      day,
      hour: parts.hour,
      minute: parts.minute,
      second: 0,
    },
    timeZone,
  );
}

function addZonedDaysKeepingTime(
  timeZone: string,
  fromIso: string,
  days: number,
): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  return addZonedDays(timeZone, from, days, parts.hour, parts.minute);
}

/** Israeli work week: Sunday–Thursday. */
function isIsraeliWeekday(weekday: number): boolean {
  return weekday >= 0 && weekday <= 4;
}

function nextWeekdayOccurrence(timeZone: string, fromIso: string): string {
  let candidate = addZonedDaysKeepingTime(timeZone, fromIso, 1);
  for (let i = 0; i < 8; i++) {
    const weekday = getZonedParts(new Date(candidate), timeZone).weekday;
    if (isIsraeliWeekday(weekday)) return candidate;
    candidate = addZonedDaysKeepingTime(timeZone, candidate, 1);
  }
  return candidate;
}

/** Compute the next fire time after `fromIso` for a recurrence rule. */
export function advanceReminderDueDate(
  fromIso: string,
  recurrence: ReminderRecurrence,
  timezone = DEFAULT_TIMEZONE,
): string {
  switch (recurrence) {
    case "daily":
      return addZonedDaysKeepingTime(timezone, fromIso, 1);
    case "weekly":
      return addZonedDaysKeepingTime(timezone, fromIso, 7);
    case "monthly":
      return addZonedMonthsKeepingTime(timezone, fromIso, 1);
    case "weekdays":
      return nextWeekdayOccurrence(timezone, fromIso);
  }
}

export interface ResolveItemReminderInput {
  title: string;
  content: string;
  dueDate?: string | null;
  metadata?: unknown;
  isActionable: boolean;
  timezone?: string;
  referenceDate?: Date;
  userCancelled?: boolean;
  userManualDue?: string | null;
  recurrence?: ReminderRecurrence | null;
}

export interface ResolveItemReminderResult {
  dueDate: string | null;
  metadata: Record<string, unknown>;
}

function resolveNoteReminder(
  input: ResolveItemReminderInput,
  metadata: Record<string, unknown>,
  timezone: string,
): ResolveItemReminderResult {
  if (input.userCancelled) {
    return {
      dueDate: null,
      metadata: patchReminderMetadata(metadata, {
        disabled: true,
        manual: false,
        sent: false,
        recurrence: null,
      }),
    };
  }

  if (input.userManualDue) {
    const normalized = normalizeDueDateIso(input.userManualDue, timezone);
    if (normalized) {
      let next = patchReminderMetadata(metadata, {
        manual: true,
        disabled: false,
        sent: false,
        recurrence:
          input.recurrence !== undefined
            ? input.recurrence
            : getReminderRecurrence(metadata),
      });
      next = syncAnalysisFireTimes(next, normalized);
      return { dueDate: normalized, metadata: next };
    }
  }

  const flags = getReminderFlags(metadata);
  if (flags.disabled) {
    return { dueDate: null, metadata };
  }

  if (flags.manual && input.dueDate) {
    const normalized = normalizeDueDateIso(input.dueDate, timezone);
    if (normalized) {
      return { dueDate: normalized, metadata };
    }
  }

  return { dueDate: null, metadata };
}

/** Derive reminder from item text, defaulting to tomorrow unless user overrode or cancelled. */
export function resolveItemReminder(
  input: ResolveItemReminderInput,
): ResolveItemReminderResult {
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const referenceDate = input.referenceDate ?? new Date();
  let metadata = patchReminderMetadata(input.metadata, {});

  if (!input.isActionable) {
    return resolveNoteReminder(input, metadata, timezone);
  }

  if (input.userCancelled) {
    metadata = patchReminderMetadata(metadata, {
      disabled: true,
      manual: false,
      sent: false,
      recurrence: null,
    });
    return { dueDate: null, metadata };
  }

  if (input.userManualDue) {
    const normalized = normalizeDueDateIso(input.userManualDue, timezone);
    if (normalized) {
      metadata = patchReminderMetadata(metadata, {
        manual: true,
        disabled: false,
        sent: false,
        recurrence:
          input.recurrence !== undefined
            ? input.recurrence
            : getReminderRecurrence(metadata),
      });
      metadata = syncAnalysisFireTimes(metadata, normalized);
      return { dueDate: normalized, metadata };
    }
  }

  const flags = getReminderFlags(metadata);
  if (flags.disabled) {
    return { dueDate: null, metadata };
  }

  if (flags.manual && input.dueDate) {
    const normalized = normalizeDueDateIso(input.dueDate, timezone);
    if (normalized) {
      return { dueDate: normalized, metadata };
    }
  }

  const text = `${input.title} ${input.content}`.trim();
  const fromContent = resolveDueDateFromText(text, { timezone, referenceDate });
  const normalizedExisting = normalizeDueDateIso(input.dueDate, timezone);
  const dueDate =
    normalizedExisting ??
    fromContent ??
    (hasTemporalHint(text)
      ? null
      : defaultTomorrowReminderIso(timezone, referenceDate));

  metadata = patchReminderMetadata(metadata, { manual: false, disabled: false });
  return { dueDate, metadata };
}

export function buildTaskReminderUpdate(
  item: {
    title: string;
    content: string;
    due_date: string | null;
    metadata?: unknown;
    is_actionable: boolean;
  },
  input: {
    title: string;
    content: string;
    due_date: string | null;
    recurrence?: ReminderRecurrence | null;
  },
): ResolveItemReminderResult {
  if (!input.due_date) {
    return resolveItemReminder({
      title: input.title,
      content: input.content,
      metadata: item.metadata,
      isActionable: item.is_actionable,
      userCancelled: true,
    });
  }

  const flags = getReminderFlags(item.metadata);
  const dueChanged = input.due_date !== item.due_date;
  const recurrence =
    input.recurrence !== undefined
      ? input.recurrence
      : getReminderRecurrence(item.metadata);

  if (dueChanged || flags.manual || !item.is_actionable) {
    return resolveItemReminder({
      title: input.title,
      content: input.content,
      metadata: item.metadata,
      isActionable: item.is_actionable,
      userManualDue: input.due_date,
      recurrence,
    });
  }

  return resolveItemReminder({
    title: input.title,
    content: input.content,
    dueDate: null,
    metadata: patchReminderMetadata(item.metadata, { manual: false }),
    isActionable: true,
  });
}

export function effectiveTaskDueDate(item: {
  title: string;
  content: string;
  due_date: string | null;
  metadata?: unknown;
  is_actionable: boolean;
}): string | null {
  const flags = getReminderFlags(item.metadata);
  if (flags.disabled) return null;

  if (!item.is_actionable) {
    return flags.manual && item.due_date ? item.due_date : null;
  }

  if (item.due_date) return item.due_date;
  return resolveItemReminder({
    title: item.title,
    content: item.content,
    metadata: item.metadata,
    isActionable: true,
  }).dueDate;
}

type ItemReminderSource = {
  title: string;
  content: string;
  due_date?: string | null;
  metadata?: unknown;
  is_actionable: boolean;
};

export function buildManualReminderPatch(
  item: ItemReminderSource,
  dueDate: string,
  recurrence?: ReminderRecurrence | null,
): { due_date: string | null; metadata: Record<string, unknown> } {
  const resolved = resolveItemReminder({
    title: item.title,
    content: item.content,
    metadata: item.metadata,
    isActionable: item.is_actionable,
    userManualDue: dueDate,
    recurrence:
      recurrence !== undefined ? recurrence : getReminderRecurrence(item.metadata),
  });
  return { due_date: resolved.dueDate, metadata: resolved.metadata };
}

export function buildClearReminderPatch(
  item: ItemReminderSource,
): { due_date: null; metadata: Record<string, unknown> } {
  const resolved = resolveItemReminder({
    title: item.title,
    content: item.content,
    metadata: item.metadata,
    isActionable: item.is_actionable,
    userCancelled: true,
  });
  return { due_date: null, metadata: resolved.metadata };
}

export function buildInferredReminderPatch(
  item: ItemReminderSource,
): { due_date: string | null; metadata: Record<string, unknown> } {
  const resolved = resolveItemReminder({
    title: item.title,
    content: item.content,
    dueDate: item.due_date ?? null,
    metadata: item.metadata,
    isActionable: item.is_actionable,
  });
  return { due_date: resolved.dueDate, metadata: resolved.metadata };
}

/**
 * After a reminder fires: if recurring, advance due/notify; otherwise mark sent.
 */
export function buildAfterReminderSentPatch(
  item: {
    due_date?: string | null;
    metadata?: unknown;
  },
  options?: { timezone?: string; firedAt?: string },
): { due_date?: string | null; metadata: Record<string, unknown> } {
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const recurrence = getReminderRecurrence(item.metadata);
  const fromIso =
    (typeof item.due_date === "string" && item.due_date) ||
    options?.firedAt ||
    null;

  if (!recurrence || !fromIso) {
    return {
      metadata: patchReminderMetadata(item.metadata, { sent: true }),
    };
  }

  const nextDue = advanceReminderDueDate(fromIso, recurrence, timezone);
  let metadata = patchReminderMetadata(item.metadata, {
    sent: false,
    manual: true,
    disabled: false,
    recurrence,
  });
  metadata = syncAnalysisFireTimes(metadata, nextDue);
  return { due_date: nextDue, metadata };
}
