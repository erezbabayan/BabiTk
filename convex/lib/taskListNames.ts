/** Default list title: selected tags + creation date (Hebrew locale). */
export function defaultTaskListName(
  filterTags: string[],
  timestampMs = Date.now(),
): string {
  const tagsPart = filterTags.map((tag) => tag.trim().replace(/^#+/, "")).join(" · ");
  const datePart = formatTaskListDate(timestampMs);
  return tagsPart ? `${tagsPart} · ${datePart}` : datePart;
}

export function formatTaskListDate(timestampMs: number): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(timestampMs));
}

export function isListReminderActive(reminderAt: string | null | undefined): boolean {
  if (!reminderAt) return false;
  const ms = new Date(reminderAt).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

export function formatListReminderAt(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
