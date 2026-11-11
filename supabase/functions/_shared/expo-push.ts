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

const EXPO_TOKEN_PREFIXES = ["ExponentPushToken[", "ExpoPushToken["] as const;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: string;
  data: {
    source: "server_push";
    itemId: string;
    fireAt: string;
  };
};

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
  item: { id: string; title: string; notifyAt: string },
): ExpoPushMessage[] {
  const body = item.title.trim() || "יש תזכורת שממתינה";
  return uniqueExpoPushTokens(tokens).map((to) => ({
    to,
    title: "תזכורת",
    body,
    sound: "default",
    priority: "high",
    channelId: ANDROID_REMINDER_CHANNEL_ID,
    data: {
      source: "server_push",
      itemId: item.id,
      fireAt: item.notifyAt,
    },
  }));
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
