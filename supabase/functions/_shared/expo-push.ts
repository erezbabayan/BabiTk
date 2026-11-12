/**
 * Expo push for item due reminders.
 *
 * WhatsApp delivery stays in whatsapp-send-reminders. This module only builds
 * the Android push and the metadata stamp that makes that push fire once per
 * notify instant. The stamp lives on mindtasker_items.metadata so a missed
 * WhatsApp send can retry without sending the phone notification again.
 */

export const ANDROID_REMINDER_CHANNEL_ID = "reminders";
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Notification categories registered on the phone (mobile/src/lib/reminder-notification-actions.ts).
 * Tasks get בוצע / עוד שעה / מחר 09:00; notes only the two snooze buttons.
 * No ":" or "-" in ids (expo-notifications restriction). Keep both files in sync.
 */
export const REMINDER_CATEGORY_TASK = "item_reminder_task";
export const REMINDER_CATEGORY_NOTE = "item_reminder_note";

const EXPO_TOKEN_PREFIXES = ["ExponentPushToken[", "ExpoPushToken["] as const;

/**
 * Token rows written by an app build that presents server reminders itself
 * (headless push + background task). Older builds have no push_format.
 */
export const PUSH_FORMAT_HEADLESS = "headless_v1";

/**
 * Classic Notification Message (title/body/channelId at top level).
 * On Android, FCM renders it in the tray when the app is backgrounded or
 * killed, so expo-notifications never applies categoryId: no buttons.
 * Kept for app builds that cannot present headless reminders.
 */
export type ExpoNotificationPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: string;
  categoryId: string;
  data: {
    source: "server_push";
    itemId: string;
    fireAt: string;
  };
};

/**
 * Headless (data-only) message. The app's expo-task-manager task receives it
 * in every app state and presents a local notification with the category,
 * so the buttons show in background and killed states too.
 * See https://github.com/expo/expo/issues/36282.
 */
export type ExpoHeadlessPushMessage = {
  to: string;
  priority: "high";
  _contentAvailable: true;
  data: {
    source: "server_push";
    kind: "item_reminder";
    itemId: string;
    fireAt: string;
    reminderTitle: string;
    reminderBody: string;
    categoryId: string;
  };
};

export type ExpoPushMessage = ExpoNotificationPushMessage | ExpoHeadlessPushMessage;

/** Tokens whose row says the app presents headless reminders (missing column = none). */
export function headlessPushTokens(rows: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { token, push_format } = row as { token?: unknown; push_format?: unknown };
    if (isExpoPushToken(token) && push_format === PUSH_FORMAT_HEADLESS) out.add(token);
  }
  return out;
}

export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || !token.endsWith("]")) return false;
  return EXPO_TOKEN_PREFIXES.some(
    (prefix) => token.startsWith(prefix) && token.length > prefix.length + 1,
  );
}

export function uniqueExpoPushTokens(tokens: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (!isExpoPushToken(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** In-app popups default on. Only an explicit false opts out. */
export function pushAllowedByPreference(notifyInApp: unknown): boolean {
  return notifyInApp !== false;
}

export function pushReminderFireStamp(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).push_reminder_fire_at;
  return typeof value === "string" && value.trim() ? value : null;
}

export function shouldSendItemPush(metadata: unknown, notifyAt: string): boolean {
  return pushReminderFireStamp(metadata) !== notifyAt;
}

/** Returns the same object when push was not delivered, so WhatsApp patches stay identical. */
export function withPushReminderStamp(
  metadata: Record<string, unknown>,
  notifyAt: string,
  pushDelivered: boolean,
): Record<string, unknown> {
  if (!pushDelivered || pushReminderFireStamp(metadata) === notifyAt) return metadata;
  return { ...metadata, push_reminder_fire_at: notifyAt };
}

export function buildItemReminderPushMessages(
  tokens: readonly string[],
  item: { id: string; title: string; notifyAt: string; isActionable?: boolean | null },
  options?: { headlessTokens?: ReadonlySet<string> },
): ExpoPushMessage[] {
  const body = item.title.trim() || "יש תזכורת שממתינה";
  const categoryId = item.isActionable === false ? REMINDER_CATEGORY_NOTE : REMINDER_CATEGORY_TASK;
  return uniqueExpoPushTokens(tokens).map((to): ExpoPushMessage => options?.headlessTokens?.has(to)
    ? {
        to,
        priority: "high",
        _contentAvailable: true,
        data: {
          source: "server_push",
          kind: "item_reminder",
          itemId: item.id,
          fireAt: item.notifyAt,
          reminderTitle: "תזכורת",
          reminderBody: body,
          categoryId,
        },
      }
    : ({
    to,
    title: "תזכורת",
    body,
    sound: "default",
    priority: "high",
    channelId: ANDROID_REMINDER_CHANNEL_ID,
    categoryId,
    data: {
      source: "server_push",
      itemId: item.id,
      fireAt: item.notifyAt,
    },
  }) as ExpoNotificationPushMessage);
}

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

export function summarizeExpoPushTickets(
  tokens: readonly string[],
  body: unknown,
): { delivered: number; invalidTokens: string[] } {
  const data =
    body && typeof body === "object" && "data" in body
      ? (body as { data: unknown }).data
      : null;
  const tickets: unknown[] = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  let delivered = 0;
  const invalidTokens: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const ticket = tickets[i] as ExpoTicket | undefined;
    if (!token || !ticket || typeof ticket !== "object") continue;
    if (ticket.status === "ok") {
      delivered += 1;
      continue;
    }
    if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(token);
  }
  return { delivered, invalidTokens };
}

export async function sendExpoPushMessages(
  messages: readonly ExpoPushMessage[],
  options?: { accessToken?: string; fetchImpl?: typeof fetch },
): Promise<{ delivered: number; invalidTokens: string[] }> {
  if (messages.length === 0) return { delivered: 0, invalidTokens: [] };
  const fetchImpl = options?.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const accessToken = options?.accessToken?.trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    if (!response.ok) return { delivered: 0, invalidTokens: [] };
    const body: unknown = await response.json();
    return summarizeExpoPushTickets(
      messages.map((message) => message.to),
      body,
    );
  } catch {
    return { delivered: 0, invalidTokens: [] };
  }
}
