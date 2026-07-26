import { useEffect } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "../../../convex/_generated/api";
import {
  ensureAndroidReminderChannel,
  ensureNotificationPermissions,
} from "../lib/local-notifications";

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

/** Register Expo push token with Convex when signed in on a physical device. */
export function usePushRegistration(enabled: boolean): void {
  const register = useMutation(api.pushTokens.register);

  useEffect(() => {
    if (!enabled) return;
    if (!Device.isDevice) return;

    let cancelled = false;

    void (async () => {
      try {
        await ensureAndroidReminderChannel();
        const granted = await ensureNotificationPermissions();
        if (!granted || cancelled) return;

        const projectId = resolveProjectId();
        const tokenResult = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (cancelled || !tokenResult.data) return;

        const platform =
          Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
        await register({ token: tokenResult.data, platform });
      } catch (error) {
        console.warn(
          "[push] registration skipped:",
          error instanceof Error ? error.message : String(error),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, register]);
}
