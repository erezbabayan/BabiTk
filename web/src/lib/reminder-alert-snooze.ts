import {
  alertSnoozeDueAt,
  type AlertSnoozeKind,
} from "./resolve-item-reminder";

type AlertSnoozeHandler = (itemId: string, dueIso: string) => Promise<void> | void;

let handler: AlertSnoozeHandler | null = null;

export function registerAlertSnoozeHandler(next: AlertSnoozeHandler | null): void {
  handler = next;
}

export async function snoozeReminderAlert(
  itemId: string | undefined,
  kind: AlertSnoozeKind,
): Promise<boolean> {
  if (!itemId || !handler) return false;
  await handler(itemId, alertSnoozeDueAt(kind));
  return true;
}
