import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function reminderIdentifier(kind: "task" | "notebook" | "list", id: string): string {
  return `reminder:${kind}:${id}`;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function ensureAndroidReminderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "תזכורות",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4f46e5",
    sound: "default",
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Schedule a local OS notification for a reminder fire time. */
export async function scheduleItemReminderNotification(options: {
  kind: "task" | "notebook" | "list";
  id: string;
  title: string;
  dueDateIso: string;
}): Promise<string | null> {
  await ensureAndroidReminderChannel();
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    console.warn("[local-notifications] permission denied — OS reminder skipped");
    return null;
  }

  const when = new Date(options.dueDateIso).getTime();
  if (!Number.isFinite(when)) return null;

  const identifier = reminderIdentifier(options.kind, options.id);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);

  const msUntil = when - Date.now();
  // Cap far-future schedules; Expo local notifications work best under ~few weeks.
  if (msUntil > 60 * 60 * 24 * 60 * 1000) {
    return null;
  }

  const channelId = Platform.OS === "android" ? "reminders" : undefined;
  const trigger =
    msUntil <= 2000
      ? {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL as Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
          repeats: false as const,
          channelId,
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE as Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(when),
          channelId,
        };

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `תזכורת: ${options.title}`,
      body: "פתח את BabaiTk לפרטים.",
      data: {
        kind: options.kind,
        id: options.id,
      },
      sound: true,
    },
    trigger,
  });

  return identifier;
}

export async function cancelItemReminderNotification(
  kind: "task" | "notebook" | "list",
  id: string,
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    reminderIdentifier(kind, id),
  ).catch(() => undefined);
}
