import { useEffect } from "react";

import {
  isNativeApp,
  parseNativeToWebMessage,
  postToNative,
  requestNativePushToken,
  settleGoogleOAuth,
} from "../lib/native-bridge";
import { saveNativePushToken } from "../lib/native-push-token";
import { requestOpenItem } from "../lib/user-notifications";
import { isSupabaseConfigured } from "../lib/supabase";

function readEventData(event: MessageEvent): unknown {
  return event.data;
}

/**
 * Listen for Expo WebView messages: Google session, push token, notification taps.
 */
export function useNativeAppBridge(userId: string | null): void {
  useEffect(() => {
    if (!isNativeApp()) return;

    function onMessage(event: MessageEvent) {
      const parsed = parseNativeToWebMessage(readEventData(event));
      if (!parsed) return;
      settleGoogleOAuth(parsed);
      if (parsed.type === "openItem" && parsed.itemId) {
        requestOpenItem(parsed.itemId);
      }
      if (parsed.type === "pushToken") {
        void saveNativePushToken(parsed.token, parsed.platform);
      }
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage as EventListener);
    postToNative({ type: "ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp() || !userId || !isSupabaseConfigured) return;
    requestNativePushToken();
    postToNative({ type: "requestNotificationPermission" });
  }, [userId]);
}
