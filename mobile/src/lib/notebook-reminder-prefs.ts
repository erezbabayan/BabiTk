/** Daily notebook reminder prefs (users.notebook_reminder_*). Pure — no app imports. */

export type NotebookReminderPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export const NOTEBOOK_REMINDER_DEFAULTS: NotebookReminderPrefs = {
  enabled: true,
  hour: 19,
  minute: 0,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function notebookReminderPrefsFromRow(
  row: Record<string, unknown> | null | undefined,
): NotebookReminderPrefs {
  return {
    enabled: row?.notebook_reminder_enabled !== false,
    hour: clampInt(row?.notebook_reminder_hour, 0, 23, NOTEBOOK_REMINDER_DEFAULTS.hour),
    minute: clampInt(row?.notebook_reminder_minute, 0, 59, NOTEBOOK_REMINDER_DEFAULTS.minute),
  };
}

export function notebookReminderRowPatch(
  patch: Partial<NotebookReminderPrefs>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row.notebook_reminder_enabled = patch.enabled;
  if (patch.hour !== undefined) row.notebook_reminder_hour = clampInt(patch.hour, 0, 23, NOTEBOOK_REMINDER_DEFAULTS.hour);
  if (patch.minute !== undefined) row.notebook_reminder_minute = clampInt(patch.minute, 0, 59, NOTEBOOK_REMINDER_DEFAULTS.minute);
  return row;
}

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
