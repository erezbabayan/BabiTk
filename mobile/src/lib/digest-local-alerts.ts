import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  ensureAndroidReminderChannel,
  ensureNotificationPermissions,
} from "./local-notifications";

const DIGEST_PREFIX = "digest-local:";
const TIMEZONE = "Asia/Jerusalem";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Next occurrence of local hour:00 in Asia/Jerusalem as a Date (device clock). */
function nextDigestFireDates(
  hours: number[],
  daysAhead: number,
  daysMode: "weekdays" | "everyday" = "everyday",
): Date[] {
  const uniqueHours = [
    ...new Set(hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)),
  ].sort((a, b) => a - b);
  if (uniqueHours.length === 0) return [];

  const now = Date.now();
  const out: Date[] = [];

  for (let day = 0; day < daysAhead; day++) {
    for (const hour of uniqueHours) {
      // Build ISO for Jerusalem calendar day + hour using Intl parts of "now + day".
      const probe = new Date(now + day * 24 * 60 * 60 * 1000);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      }).formatToParts(probe);
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
      if (!y || !m || !d) continue;

      const weekday = WEEKDAY_SHORT[wd] ?? 0;
      // Israel ימי חול: Sunday–Thursday
      if (daysMode === "weekdays" && (weekday < 0 || weekday > 4)) continue;

      // Interpret as Jerusalem wall-clock via formatter + offset estimate:
      // Convert "Y-M-D hour:00 in Asia/Jerusalem" to UTC millis.
      const asUtcGuess = Date.parse(`${y}-${m}-${d}T${pad2(hour)}:00:00+03:00`);
      // Israel switches DST (+02/+03). Refine using timeZoneName offset if available.
      const refined = jerusalemWallClockToUtc(Number(y), Number(m), Number(d), hour, 0);
      const fire = refined ?? (Number.isFinite(asUtcGuess) ? asUtcGuess : NaN);
      if (!Number.isFinite(fire) || fire <= now + 15_000) continue;
      out.push(new Date(fire));
    }
  }

  return out;
}

function jerusalemWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  // Binary-search UTC instant whose Jerusalem parts equal the wall clock.
  let lo = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 1, 23, 59, 59);
  const target = `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`;

  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const label = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(mid));
    const y = label.find((p) => p.type === "year")?.value;
    const m = label.find((p) => p.type === "month")?.value;
    const d = label.find((p) => p.type === "day")?.value;
    const h = label.find((p) => p.type === "hour")?.value;
    const min = label.find((p) => p.type === "minute")?.value;
    const got = `${y}-${m}-${d} ${h}:${min}`;
    if (got === target) return mid;
    if (got < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

async function cancelScheduledDigestAlerts(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(DIGEST_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Schedule OS notifications (with sound) for daily WhatsApp digest hours.
 * Needed because WhatsApp suppresses sound when Green-API uses the same phone as recipient.
 */
export async function syncDigestLocalAlerts(options: {
  enabled: boolean;
  hours: number[];
  days?: "weekdays" | "everyday";
}): Promise<number> {
  await ensureAndroidReminderChannel();
  await cancelScheduledDigestAlerts();

  if (!options.enabled || options.hours.length === 0) return 0;

  const granted = await ensureNotificationPermissions();
  if (!granted) return 0;

  const fires = nextDigestFireDates(options.hours, 14, options.days ?? "everyday");
  const channelId = Platform.OS === "android" ? "reminders" : undefined;
  let scheduled = 0;

  for (const when of fires) {
    const label = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(when);
    const y = label.find((p) => p.type === "year")?.value ?? "0";
    const m = label.find((p) => p.type === "month")?.value ?? "0";
    const d = label.find((p) => p.type === "day")?.value ?? "0";
    const h = label.find((p) => p.type === "hour")?.value ?? "0";
    const identifier = `${DIGEST_PREFIX}${y}-${m}-${d}T${h}`;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: "הודעה יומית מ־BabaiTk",
        body: "נשלחו תזכורות ל־WhatsApp — פתח את הצ'אט",
        sound: true,
        data: { kind: "daily_digest_local" },
        ...(Platform.OS === "android"
          ? {
              channelId: "reminders",
              priority: Notifications.AndroidNotificationPriority.MAX,
            }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId,
      },
    });
    scheduled += 1;
  }

  return scheduled;
}

/** Fire an immediate OS alert (used after a digest is confirmed sent). */
export async function presentDigestReceivedAlert(options: {
  title: string;
  body: string;
}): Promise<void> {
  await ensureAndroidReminderChannel();
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

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
      sound: true,
      data: { kind: "daily_digest", source: "in_app_echo" },
      ...(Platform.OS === "android"
        ? { priority: Notifications.AndroidNotificationPriority.MAX }
        : {}),
    },
    trigger,
  });
}
