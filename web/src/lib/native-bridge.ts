/** Protocol between the production web app and the Expo WebView shell. */

export const BABITK_NATIVE_USER_AGENT = "BabiTkNative";
export const BABITK_NATIVE_SOURCE = "babitk-native";

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

type NativeHostWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  BabiTkNative?: { version: string };
};

function nativeWindow(): NativeHostWindow | null {
  if (typeof window === "undefined") return null;
  return window as NativeHostWindow;
}

export function isNativeApp(): boolean {
  const host = nativeWindow();
  if (!host) return false;
  if (host.ReactNativeWebView) return true;
  if (host.BabiTkNative) return true;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes(BABITK_NATIVE_USER_AGENT)) {
    return true;
  }
  return false;
}

export function postToNative(message: WebToNativeMessage): boolean {
  const host = nativeWindow();
  const bridge = host?.ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify({ source: BABITK_NATIVE_SOURCE, ...message }));
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseNativeToWebMessage(raw: unknown): NativeToWebMessage | null {
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
    case "nativeReady":
      return typeof value.version === "string"
        ? { type: "nativeReady", version: value.version }
        : null;
    case "notificationPermission":
      return { type: "notificationPermission", granted: value.granted === true };
    case "pushToken":
      return typeof value.token === "string" &&
        (value.platform === "ios" || value.platform === "android")
        ? { type: "pushToken", token: value.token, platform: value.platform }
        : null;
    case "googleSession":
      return typeof value.requestId === "string" &&
        typeof value.accessToken === "string" &&
        typeof value.refreshToken === "string"
        ? {
            type: "googleSession",
            requestId: value.requestId,
            accessToken: value.accessToken,
            refreshToken: value.refreshToken,
          }
        : null;
    case "googleOAuthError":
      return typeof value.requestId === "string" && typeof value.message === "string"
        ? { type: "googleOAuthError", requestId: value.requestId, message: value.message }
        : null;
    case "openItem":
      return typeof value.itemId === "string"
        ? { type: "openItem", itemId: value.itemId }
        : null;
    default:
      return null;
  }
}

const googleWaiters = new Map<
  string,
  {
    resolve: (session: { accessToken: string; refreshToken: string }) => void;
    reject: (error: Error) => void;
  }
>();

export function settleGoogleOAuth(message: NativeToWebMessage): void {
  if (message.type === "googleSession") {
    const waiter = googleWaiters.get(message.requestId);
    if (!waiter) return;
    googleWaiters.delete(message.requestId);
    waiter.resolve({ accessToken: message.accessToken, refreshToken: message.refreshToken });
    return;
  }
  if (message.type === "googleOAuthError") {
    const waiter = googleWaiters.get(message.requestId);
    if (!waiter) return;
    googleWaiters.delete(message.requestId);
    waiter.reject(new Error(message.message));
  }
}

export function requestNativeGoogleOAuth(): Promise<{ accessToken: string; refreshToken: string }> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `g-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      googleWaiters.delete(requestId);
      reject(new Error("התחברות Google נכשלה (פג הזמן)"));
    }, 120_000);
    googleWaiters.set(requestId, {
      resolve: (session) => {
        window.clearTimeout(timer);
        resolve(session);
      },
      reject: (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    });
    const posted = postToNative({ type: "googleOAuth", requestId });
    if (!posted) {
      window.clearTimeout(timer);
      googleWaiters.delete(requestId);
      reject(new Error("מעטפת האפליקציה לא זמינה להתחברות Google"));
    }
  });
}

export function openNativeWhatsApp(): boolean {
  return postToNative({ type: "openWhatsApp" });
}

export function requestNativeNotificationPermission(): boolean {
  return postToNative({ type: "requestNotificationPermission" });
}

export function requestNativePushToken(): boolean {
  return postToNative({ type: "requestPushToken" });
}

export function syncNativeReminders(items: NativeReminderItem[]): boolean {
  return postToNative({ type: "syncReminders", items });
}
