import type { AlertSnoozeKind } from "./resolve-item-reminder";

type AlertSnoozeHandler = (itemId: string, kind: AlertSnoozeKind) => Promise<void> | void;

let handler: AlertSnoozeHandler | null = null;

export function registerAlertSnoozeHandler(next: AlertSnoozeHandler | null): void {
  handler = next;
}

export async function snoozeReminderAlert(
  itemId: string | undefined,
  kind: AlertSnoozeKind,
): Promise<boolean> {
  if (!itemId || !handler) return false;
  await handler(itemId, kind);
  return true;
}
