import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";

import { signInWithGoogle } from "../lib/google-auth";
import {
  cancelItemReminderNotification,
  ensureAndroidReminderChannel,
  ensureNotificationPermissions,
  scheduleItemReminderNotification,
} from "../lib/local-notifications";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";
import {
  BABITK_NATIVE_SOURCE,
  BABITK_NATIVE_USER_AGENT,
  NATIVE_BRIDGE_VERSION,
  parseWebToNativeMessage,
  type NativeToWebMessage,
  type NativeReminderItem,
} from "./bridge";

const DEFAULT_WEB_URL = "https://erezbabayan.github.io/BabiTk/";

function resolveWebUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  if (fromEnv) return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  const extra = Constants.expoConfig?.extra as { webUrl?: string } | undefined;
  const fromExtra = extra?.webUrl?.trim();
  if (fromExtra) return fromExtra.endsWith("/") ? fromExtra : `${fromExtra}/`;
  return DEFAULT_WEB_URL;
}

function resolveProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (fromEnv) return fromEnv;
  const eas = Constants.easConfig?.projectId;
  if (typeof eas === "string" && eas.length > 0) return eas;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  if (typeof extra?.eas?.projectId === "string" && extra.eas.projectId.length > 0) {
    return extra.eas.projectId;
  }
  return undefined;
}

function injectNativeMessage(payload: NativeToWebMessage): string {
  const body = JSON.stringify({ source: BABITK_NATIVE_SOURCE, ...payload });
  return `
    (function() {
      try {
        window.postMessage(${JSON.stringify(body)}, "*");
      } catch (err) {}
      true;
    })();
  `;
}

async function syncLocalReminders(items: NativeReminderItem[]): Promise<void> {
  await ensureAndroidReminderChannel();
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(`${item.kind}:${item.id}`);
    await scheduleItemReminderNotification({
      kind: item.kind,
      id: item.id,
      title: item.title,
      dueDateIso: item.fireAt,
    });
  }
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const entry of scheduled) {
    const identifier = entry.identifier;
    if (!identifier.startsWith("reminder:")) continue;
    const parts = identifier.split(":");
    const kind = parts[1];
    const id = parts.slice(2).join(":");
    if (kind !== "task" && kind !== "notebook" && kind !== "list") continue;
    if (!seen.has(`${kind}:${id}`)) {
      await cancelItemReminderNotification(kind, id);
    }
  }
}

function WebAppShellInner() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastVersionRef = useRef<string | null>(null);
  const webUrl = useMemo(() => resolveWebUrl(), []);

  const sendToWeb = useCallback((payload: NativeToWebMessage) => {
    webViewRef.current?.injectJavaScript(injectNativeMessage(payload));
  }, []);

  const registerPushToken = useCallback(async () => {
    if (!Device.isDevice) return;
    await ensureAndroidReminderChannel();
    const granted = await ensureNotificationPermissions();
    sendToWeb({ type: "notificationPermission", granted });
    if (!granted) return;
    try {
      const projectId = resolveProjectId();
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      if (!tokenResult.data) return;
      const platform = Platform.OS === "ios" ? "ios" : "android";
      sendToWeb({ type: "pushToken", token: tokenResult.data, platform });
    } catch (error) {
      console.warn(
        "[push] token skipped:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [sendToWeb]);

  const handleGoogleOAuth = useCallback(
    async (requestId: string) => {
      try {
        if (!isSupabaseConfigured) {
          throw new Error("התחברות Google דורשת חיבור לענן");
        }
        const session = await signInWithGoogle(requireSupabase());
        sendToWeb({
          type: "googleSession",
          requestId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        });
      } catch (error) {
        sendToWeb({
          type: "googleOAuthError",
          requestId,
          message: error instanceof Error ? error.message : "התחברות Google נכשלה",
        });
      }
    },
    [sendToWeb],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseWebToNativeMessage(event.nativeEvent.data);
      if (!parsed) return;
      switch (parsed.type) {
        case "ready":
          sendToWeb({ type: "nativeReady", version: NATIVE_BRIDGE_VERSION });
          break;
        case "requestNotificationPermission":
        case "requestPushToken":
          void registerPushToken();
          break;
        case "syncReminders":
          void syncLocalReminders(parsed.items);
          break;
        case "openWhatsApp":
          void Linking.openURL("whatsapp://send").catch(() =>
            Linking.openURL("https://wa.me/"),
          );
          break;
        case "googleOAuth":
          void handleGoogleOAuth(parsed.requestId);
          break;
      }
    },
    [handleGoogleOAuth, registerPushToken, sendToWeb],
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const itemId = typeof data.id === "string" ? data.id : null;
      if (itemId) sendToWeb({ type: "openItem", itemId });
    });
    return () => sub.remove();
  }, [sendToWeb]);

  useEffect(() => {
    async function checkVersion() {
      try {
        const response = await fetch(`${webUrl}app-version.json`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { v?: string };
        const next = typeof body.v === "string" ? body.v : null;
        if (!next) return;
        if (lastVersionRef.current && lastVersionRef.current !== next) {
          webViewRef.current?.reload();
        }
        lastVersionRef.current = next;
      } catch {
        /* ignore version probe failures */
      }
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkVersion();
    });
    void checkVersion();
    return () => sub.remove();
  }, [webUrl]);

  const userAgent = BABITK_NATIVE_USER_AGENT;

  function onShouldStart(request: WebViewNavigation): boolean {
    const url = request.url;
    if (url.startsWith("whatsapp://") || url.startsWith("https://wa.me/")) {
      void Linking.openURL(url);
      return false;
    }
    return true;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: webUrl }}
        style={styles.webview}
        applicationNameForUserAgent={userAgent}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={onShouldStart}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        onError={(event) => {
          setLoadError(event.nativeEvent.description || "טעינת המערכת נכשלה");
          setLoading(false);
        }}
        injectedJavaScriptBeforeContentLoaded={`
          window.BabiTkNative = { version: "${NATIVE_BRIDGE_VERSION}" };
          true;
        `}
        mixedContentMode="always"
      />
      {loading ? (
        <View style={styles.splash} pointerEvents="none">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.splashText}>טוען את BabiTk…</Text>
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text
            style={styles.retry}
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              webViewRef.current?.reload();
            }}
          >
            נסו שוב
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function WebAppShell() {
  return (
    <SafeAreaProvider>
      <WebAppShellInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },
  webview: { flex: 1, backgroundColor: "#f1f5f9" },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  splashText: { marginTop: 12, color: "#64748b", fontSize: 14 },
  errorBox: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { color: "#b91c1c", textAlign: "center" },
  retry: { marginTop: 8, color: "#2563eb", textAlign: "center", fontWeight: "600" },
});
