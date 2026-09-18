import { BABITK_NATIVE_SOURCE } from "./protocol";

export {
  BABITK_NATIVE_SOURCE,
  BABITK_NATIVE_USER_AGENT,
  NATIVE_BRIDGE_VERSION,
} from "./protocol";

export type NativeReminderKind = "task" | "notebook" | "list";

export type NativeReminderItem = {
  kind: NativeReminderKind;
  id: string;
  title: string;
  fireAt: string;
};

export type WebToNativeMessage =
  | { type: "ready" }
  | { type: "requestNotificationPermission" }
  | { type: "requestPushToken" }
  | { type: "syncReminders"; items: NativeReminderItem[] }
  | { type: "openWhatsApp" }
  | { type: "googleOAuth"; requestId: string };

export type NativeToWebMessage =
  | { type: "nativeReady"; version: string }
  | { type: "notificationPermission"; granted: boolean }
  | { type: "pushToken"; token: string; platform: "ios" | "android" }
  | { type: "googleSession"; requestId: string; accessToken: string; refreshToken: string }
  | { type: "googleOAuthError"; requestId: string; message: string }
  | { type: "openItem"; itemId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReminderKind(value: unknown): value is NativeReminderKind {
  return value === "task" || value === "notebook" || value === "list";
}

export function parseWebToNativeMessage(raw: unknown): WebToNativeMessage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.source !== BABITK_NATIVE_SOURCE || typeof value.type !== "string") {
    return null;
  }
  switch (value.type) {
    case "ready":
    case "requestNotificationPermission":
    case "requestPushToken":
    case "openWhatsApp":
      return { type: value.type };
    case "googleOAuth":
      return typeof value.requestId === "string"
        ? { type: "googleOAuth", requestId: value.requestId }
        : null;
    case "syncReminders": {
      if (!Array.isArray(value.items)) return { type: "syncReminders", items: [] };
      const items: NativeReminderItem[] = [];
      for (const entry of value.items) {
        if (!isRecord(entry)) continue;
        if (!isReminderKind(entry.kind)) continue;
        if (typeof entry.id !== "string" || typeof entry.title !== "string") continue;
        if (typeof entry.fireAt !== "string") continue;
        items.push({
          kind: entry.kind,
          id: entry.id,
          title: entry.title,
          fireAt: entry.fireAt,
        });
      }
      return { type: "syncReminders", items };
    }
    default:
      return null;
  }
}
