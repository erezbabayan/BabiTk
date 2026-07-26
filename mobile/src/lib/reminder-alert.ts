import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  ensureAndroidReminderChannel,
  ensureNotificationPermissions,
} from "./local-notifications";

/** Fire an immediate OS notification with default sound (foreground popup + audio). */
export async function presentImmediateReminderAlert(options: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  await ensureAndroidReminderChannel();
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  // Android channel belongs on the trigger, not content — otherwise sound/importance
  // fall back to the default channel.
  const trigger =
    Platform.OS === "android"
      ? ({
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
          repeats: false,
          channelId: "reminders",
        } as const)
      : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: options.title,
      body: options.body,
      data: options.data ?? {},
      sound: true,
      ...(Platform.OS === "android"
        ? { priority: Notifications.AndroidNotificationPriority.MAX }
        : {}),
    },
    trigger,
  });
}
