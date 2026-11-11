import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { isExpoPushToken, upsertOwnPushToken } from "../lib/push-token";
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

/**
 * Register this device's Expo push token on the signed-in user.
 * Production has no REST API, so the token is written to user_push_tokens
 * with the user's Supabase session (RLS: auth.uid() = user_id).
 */
export function usePushRegistration(enabled: boolean, userId: string | undefined): void {
  useEffect(() => {
    if (!enabled || !userId) return;
    if (!Device.isDevice) return;

    let cancelled = false;
    let registered = false;
    let inFlight = false;
    let missingProject = false;

    const attempt = async () => {
      if (cancelled || registered || inFlight || missingProject) return;
      inFlight = true;
      try {
        await ensureAndroidReminderChannel();
        const granted = await ensureNotificationPermissions();
        if (!granted || cancelled) return;

        const projectId = resolveProjectId();
        if (!projectId) {
          missingProject = true;
          console.warn(
            "[push] missing EAS projectId (EXPO_PUBLIC_EAS_PROJECT_ID or extra.eas.projectId). Token was not registered.",
          );
          return;
        }

        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenResult.data;
        if (cancelled || !token || !isExpoPushToken(token)) return;

        const platform =
          Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
        await upsertOwnPushToken({ userId, token, platform });
        registered = true;
      } catch (error) {
        console.warn(
          "[push] registration skipped:",
          error instanceof Error ? error.message : "unknown",
        );
      } finally {
        inFlight = false;
      }
    };

    void attempt();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void attempt();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, userId]);
}
