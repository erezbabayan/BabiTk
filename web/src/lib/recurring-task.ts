import {
  advanceReminderDueDate,
  getReminderRecurrence,
  patchReminderMetadata,
  type ReminderRecurrence,
} from "./resolve-item-reminder";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type RecurringSource = {
  title: string;
  content: string;
  is_actionable: boolean;
  due_date?: string | null;
  tags: string[];
  metadata?: unknown;
  source_material_id?: string | null;
};

export function nextOccurrenceDueDate(
  item: { due_date?: string | null; metadata?: unknown },
  completedAt = new Date(),
  timezone = DEFAULT_TIMEZONE,
): { recurrence: ReminderRecurrence; dueDate: string } | null {
  const recurrence = getReminderRecurrence(item.metadata);
  if (!recurrence) return null;
  const fromIso =
    (typeof item.due_date === "string" && item.due_date) || completedAt.toISOString();
  return {
    recurrence,
    dueDate: advanceReminderDueDate(fromIso, recurrence, timezone),
  };
}

export function buildNextOccurrenceInsert(
  item: RecurringSource,
  completedAt = new Date(),
  timezone = DEFAULT_TIMEZONE,
): {
  title: string;
  content: string;
  is_actionable: boolean;
  status: "pending";
  due_date: string;
  tags: string[];
  metadata: Record<string, unknown>;
  source_material_id: string | null;
} | null {
  const next = nextOccurrenceDueDate(item, completedAt, timezone);
  if (!next) return null;

  let metadata = patchReminderMetadata(item.metadata, {
    sent: false,
    disabled: false,
    manual: true,
    recurrence: next.recurrence,
  });
  const analysisRaw = metadata.analysis;
  const analysis =
    analysisRaw && typeof analysisRaw === "object"
      ? { ...(analysisRaw as Record<string, unknown>) }
      : {};
  analysis.target_at = next.dueDate;
  analysis.notify_at = next.dueDate;
  metadata = { ...metadata, analysis };

  return {
    title: item.title,
    content: item.content,
    is_actionable: item.is_actionable,
    status: "pending",
    due_date: next.dueDate,
    tags: item.tags,
    metadata,
    source_material_id: item.source_material_id ?? null,
  };
}
