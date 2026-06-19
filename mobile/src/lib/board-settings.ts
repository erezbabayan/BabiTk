import type { BoardTab } from "./item-actions";

export const INBOX_ARCHIVE_HOURS_OPTIONS = [
  { hours: 48, label: "2 ימים" },
  { hours: 72, label: "3 ימים" },
  { hours: 168, label: "שבוע" },
  { hours: 720, label: "חודש" },
] as const;

export type InboxArchiveHours = (typeof INBOX_ARCHIVE_HOURS_OPTIONS)[number]["hours"];
export const DEFAULT_INBOX_ARCHIVE_HOURS: InboxArchiveHours = 48;

export interface BoardSettings {
  inbox_archive_hours: InboxArchiveHours;
}

export const BOARD_SETTINGS_LABELS: Record<BoardTab, string> = {
  inbox: "המחברת",
  today: "משימות לביצוע",
  notes: "הערות",
};

export function inboxArchiveLabel(hours: number): string {
  return INBOX_ARCHIVE_HOURS_OPTIONS.find((option) => option.hours === hours)?.label ?? "2 ימים";
}
