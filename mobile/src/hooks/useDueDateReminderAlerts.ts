import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";

import type { ReminderAlertItem } from "./useReminderAlerts";
import {
  formatReminderAlertBody,
  isItemDueForReminder,
  nextUpcomingReminderDelayMs,
  reminderAlertId,
  resolveItemReminderFireAt,
  type ReminderSourceItem,
} from "../lib/due-date-reminder";
import { presentImmediateReminderAlert } from "../lib/reminder-alert";
import {
  ensureAndroidReminderChannel,
  ensureNotificationPermissions,
  syncDueDateLocalNotifications,
} from "../lib/local-notifications";

const POLL_MS = 15_000;
const MAX_TIMER_MS = 2_147_000_000;

export type DueDateReminderItem = ReminderSourceItem;

function pruneSeenIds(seen: Set<string>, max = 200) {
  if (seen.size <= max) return;
  const drop = seen.size - max;
  let i = 0;
  for (const id of seen) {
    seen.delete(id);
    i += 1;
    if (i >= drop) break;
  }
}

/**
 * Watch open tasks and fire an in-app reminder (popup + OS sound) when the
 * due date arrives. Scans again whenever Android brings the app to the
 * foreground, and keeps local DATE notifications in sync for background.
 */
export function useDueDateReminderAlerts<T extends DueDateReminderItem>(
  items: T[],
  enabled: boolean,
  onFired?: (item: T, fireAt: string) => void | Promise<void>,
) {
  const [alert, setAlert] = useState<ReminderAlertItem | null>(null);
  const queueRef = useRef<ReminderAlertItem[]>([]);
  const seenIds = useRef(new Set<string>());
  const showingRef = useRef(false);
  const itemsRef = useRef(items);
  const onFiredRef = useRef(onFired);
  const persistedIds = useRef(new Set<string>());

  itemsRef.current = items;
  onFiredRef.current = onFired;

  const itemKey = useMemo(
    () =>
      items
        .map((item) => `${item.id}:${item.status}:${item.due_date ?? ""}:${resolveItemReminderFireAt(item) ?? ""}`)
        .join("|"),
    [items],
  );

  function presentNext() {
    if (showingRef.current) return;
    const next = queueRef.current.shift() ?? null;
    if (!next) {
      setAlert(null);
      return;
    }
    showingRef.current = true;
    setAlert(next);
    void presentImmediateReminderAlert({
      title: next.title,
      body: next.body,
      data: {
        notificationId: next._id,
        source: "in_app_echo",
        ...(next.itemId ? { itemId: next.itemId } : {}),
      },
    });
  }

  function enqueue(next: ReminderAlertItem[]) {
    for (const item of next) {
      if (seenIds.current.has(item._id)) continue;
      seenIds.current.add(item._id);
      queueRef.current.push(item);
    }
    pruneSeenIds(seenIds.current);
    presentNext();
  }

  function persistFired(item: T, fireAt: string, id: string) {
    if (persistedIds.current.has(id)) return;
    persistedIds.current.add(id);
    void Promise.resolve(onFiredRef.current?.(item, fireAt)).catch(() => {
      persistedIds.current.delete(id);
    });
  }

  function scan() {
    if (!enabled) return;
    const now = Date.now();
    const due: ReminderAlertItem[] = [];
    for (const item of itemsRef.current) {
      if (!isItemDueForReminder(item, now)) continue;
      const fireAt = resolveItemReminderFireAt(item);
      if (!fireAt) continue;
      const id = reminderAlertId(item.id, fireAt);
      persistFired(item, fireAt, id);
      if (seenIds.current.has(id)) continue;
      due.push({
        _id: id,
        title: item.title || "תזכורת",
        body: formatReminderAlertBody(item, fireAt),
        itemId: item.id,
      });
    }
    if (due.length > 0) enqueue(due);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      await ensureAndroidReminderChannel();
      await ensureNotificationPermissions();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      queueRef.current = [];
      showingRef.current = false;
      setAlert(null);
      return;
    }

    scan();

    const interval = setInterval(scan, POLL_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") scan();
    };
    const appStateSub = AppState.addEventListener("change", onAppState);

    const upcoming = nextUpcomingReminderDelayMs(itemsRef.current);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (upcoming !== null) {
      timeout = setTimeout(scan, Math.min(Math.max(upcoming, 250), MAX_TIMER_MS));
    }

    return () => {
      clearInterval(interval);
      if (timeout !== undefined) clearTimeout(timeout);
      appStateSub.remove();
    };
  }, [enabled, itemKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncDueDateLocalNotifications(itemsRef.current);
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "[due-date-reminder] OS schedule failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, itemKey]);

  useEffect(() => {
    if (!enabled) return;

    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.source === "in_app_echo") return;

      const itemId =
        typeof data?.itemId === "string"
          ? data.itemId
          : typeof data?.id === "string"
            ? data.id
            : undefined;
      const fireAt = typeof data?.fireAt === "string" ? data.fireAt : undefined;
      const notificationId =
        itemId && fireAt
          ? reminderAlertId(itemId, fireAt)
          : typeof data?.notificationId === "string" && data.notificationId
            ? data.notificationId
            : `local-${notification.request.identifier}`;
      if (seenIds.current.has(notificationId)) return;

      const title = notification.request.content.title ?? "תזכורת";
      const body =
        typeof notification.request.content.body === "string"
          ? notification.request.content.body
          : "";
      if (itemId && fireAt) {
        const source = itemsRef.current.find((entry) => entry.id === itemId);
        if (source) persistFired(source, fireAt, notificationId);
      }
      enqueue([
        {
          _id: notificationId,
          title,
          body,
          ...(itemId ? { itemId } : {}),
        },
      ]);
    });

    return () => {
      sub.remove();
    };
  }, [enabled]);

  function dismiss() {
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  async function acknowledge() {
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  return { alert, dismiss, acknowledge };
}
