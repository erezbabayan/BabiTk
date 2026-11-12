/**
 * Pure helpers for the action buttons on item reminder notifications
 * (בוצע / עוד שעה / מחר 09:00). No React Native imports, so backend tests can
 * load it. The side-effect half lives in reminder-notification-handler.ts.
 */
import {
  alertSnoozeDueAt,
  buildManualReminderPatch,
  type AlertSnoozeKind,
} from "./resolve-item-reminder";

export const REMINDER_TIMEZONE = "Asia/Jerusalem";

/**
 * Category ids the server sets as Expo `categoryId`.
 * Keep in sync with supabase/functions/_shared/expo-push.ts.
 * No ":" or "-" (expo-notifications restriction).
 */
export const REMINDER_CATEGORY_TASK = "item_reminder_task";
export const REMINDER_CATEGORY_NOTE = "item_reminder_note";

export const REMINDER_ACTION_DONE = "reminder_done";
export const REMINDER_ACTION_SNOOZE_HOUR = "reminder_snooze_hour";
export const REMINDER_ACTION_SNOOZE_TOMORROW = "reminder_snooze_tomorrow";

/** expo-notifications DEFAULT_ACTION_IDENTIFIER (tap on the notification body). */
export const DEFAULT_NOTIFICATION_ACTION = "expo.modules.notifications.actions.DEFAULT";

export type ReminderNotificationAction = "done" | "hour" | "tomorrow" | "open";

export type ReminderActionButton = {
  identifier: string;
  buttonTitle: string;
};

const DONE_BUTTON: ReminderActionButton = { identifier: REMINDER_ACTION_DONE, buttonTitle: "בוצע" };
const HOUR_BUTTON: ReminderActionButton = {
  identifier: REMINDER_ACTION_SNOOZE_HOUR,
  buttonTitle: "עוד שעה",
};
const TOMORROW_BUTTON: ReminderActionButton = {
  identifier: REMINDER_ACTION_SNOOZE_TOMORROW,
  buttonTitle: "מחר 09:00",
};

/** Android shows at most three buttons. Notes cannot be "done", so they get the two snoozes. */
export const REMINDER_CATEGORY_BUTTONS: Record<string, ReminderActionButton[]> = {
  [REMINDER_CATEGORY_TASK]: [DONE_BUTTON, HOUR_BUTTON, TOMORROW_BUTTON],
  [REMINDER_CATEGORY_NOTE]: [HOUR_BUTTON, TOMORROW_BUTTON],
};

export function parseReminderAction(actionIdentifier: unknown): ReminderNotificationAction | null {
  switch (actionIdentifier) {
    case REMINDER_ACTION_DONE:
      return "done";
    case REMINDER_ACTION_SNOOZE_HOUR:
      return "hour";
    case REMINDER_ACTION_SNOOZE_TOMORROW:
      return "tomorrow";
    case DEFAULT_NOTIFICATION_ACTION:
      return "open";
    default:
      return null;
  }
}

/** Item id from notification data (server push uses itemId, older local alerts taskId). */
export function reminderItemIdFromData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of ["itemId", "taskId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type ReminderActionItem = {
  id: string;
  title: string;
  content: string;
  is_actionable: boolean;
  status: string;
  due_date: string | null;
  metadata?: unknown;
  deleted_at?: string | null;
};

export type ReminderActionPatch = {
  status?: "completed";
  completed_at?: string;
  due_date?: string | null;
  metadata?: Record<string, unknown>;
  last_interacted_at: string;
};

/** Snooze target: +1h from now, or tomorrow 09:00 Asia/Jerusalem (same as the in-app popup). */
export function reminderSnoozeDueAt(
  kind: Extract<AlertSnoozeKind, "hour" | "tomorrow">,
  now: Date,
): string {
  return alertSnoozeDueAt(kind, now, REMINDER_TIMEZONE);
}

/**
 * Row patch for a notification action, mirroring the board's own actions:
 * - done  → completeTask (status completed + completed_at). Tasks only.
 * - hour / tomorrow → snoozeTask (manual reminder at the new instant; keeps any
 *   recurrence and clears reminder_sent; the new notify_at differs from the
 *   push/WhatsApp fire stamps so the cron fires again).
 * Returns null when there is nothing to do (deleted, already completed/archived, note "done").
 */
export function buildReminderActionPatch(
  item: ReminderActionItem,
  action: Exclude<ReminderNotificationAction, "open">,
  now: Date,
): ReminderActionPatch | null {
  if (item.deleted_at) return null;
  if (item.status !== "inbox" && item.status !== "pending") return null;
  const nowIso = now.toISOString();
  if (action === "done") {
    if (!item.is_actionable) return null;
    return { status: "completed", completed_at: nowIso, last_interacted_at: nowIso };
  }
  const dueAt = reminderSnoozeDueAt(action, now);
  const reminder = buildManualReminderPatch(
    {
      title: item.title,
      content: item.content,
      due_date: item.due_date,
      metadata: item.metadata,
      is_actionable: item.is_actionable,
    },
    dueAt,
  );
  return { ...reminder, last_interacted_at: nowIso };
}

/** Must match PUSH_FORMAT_HEADLESS in supabase/functions/_shared/expo-push.ts. */
export const PUSH_FORMAT_HEADLESS = "headless_v1";

export type HeadlessReminder = {
  identifier: string;
  title: string;
  body: string;
  categoryId: string;
  data: { source: "server_push"; itemId: string; fireAt: string };
};

/**
 * Read a headless server reminder from a notification task payload.
 * Android delivers the Expo `data` as JSON in data.dataString (FCM "body").
 * Returns null for anything else (responses, other pushes, bad JSON).
 */
export function headlessReminderFromTaskPayload(payload: unknown): HeadlessReminder | null {
  if (!payload || typeof payload !== "object" || "actionIdentifier" in payload) return null;
  const raw = (payload as { data?: unknown }).data;
  if (!raw || typeof raw !== "object") return null;
  const dataString = (raw as { dataString?: unknown }).dataString;
  let data: Record<string, unknown> | null = null;
  if (typeof dataString === "string") {
    try {
      const parsed: unknown = JSON.parse(dataString);
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!data || data.source !== "server_push" || data.kind !== "item_reminder") return null;
  const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
  const fireAt = typeof data.fireAt === "string" ? data.fireAt : "";
  if (!itemId || !fireAt) return null;
  const categoryId =
    data.categoryId === REMINDER_CATEGORY_NOTE ? REMINDER_CATEGORY_NOTE : REMINDER_CATEGORY_TASK;
  const title = typeof data.reminderTitle === "string" && data.reminderTitle.trim()
    ? data.reminderTitle
    : "תזכורת";
  const body = typeof data.reminderBody === "string" && data.reminderBody.trim()
    ? data.reminderBody
    : "יש תזכורת שממתינה";
  return {
    // Same reminder twice (retry, task run twice) replaces instead of stacking.
    identifier: `server_reminder_${itemId}_${fireAt.replace(/[^0-9A-Za-z]/g, "")}`,
    title,
    body,
    categoryId,
    data: { source: "server_push", itemId, fireAt },
  };
}
