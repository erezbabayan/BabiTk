/**
 * Pull decision for a Google event already linked to a card.
 * A newer local edit wins. Equal instants stay local.
 */

export type CalendarMergeDecision = "apply-remote" | "keep-local";

function stamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function decideCalendarMerge(input: {
  localDue: string | null;
  localUpdatedAt: string | null;
  remoteStart: string;
  remoteUpdatedAt: string | null;
}): CalendarMergeDecision {
  const localUpdated = stamp(input.localUpdatedAt);
  const remoteUpdated = stamp(input.remoteUpdatedAt);
  if (localUpdated >= remoteUpdated) return "keep-local";
  const localDue = stamp(input.localDue);
  const remoteStart = stamp(input.remoteStart);
  if (localDue && Math.abs(localDue - remoteStart) < 60_000) return "keep-local";
  return "apply-remote";
}
