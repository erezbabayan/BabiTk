const CALENDAR_PATCH_KEYS = [
  "due_date",
  "is_actionable",
  "title",
  "content",
  "deleted_at",
] as const;

export function isCalendarRelevantPatch(patch: Record<string, unknown>): boolean {
  return CALENDAR_PATCH_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}
