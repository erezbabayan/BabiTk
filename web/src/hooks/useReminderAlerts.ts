import { useEffect, useRef, useState } from "react";

import {
  listUserNotifications,
  markNotificationRead,
  subscribeUserNotifications,
  wasLocallyPresentedNotification,
  type UserNotification,
} from "../lib/user-notifications";
import {
  playReminderChime,
  showBrowserReminderNotification,
} from "../lib/reminder-chime";

export type ReminderAlertItem = {
  _id: string;
  title: string;
  body: string;
  itemId?: string;
};

function toAlertItem(row: UserNotification): ReminderAlertItem {
  return {
    _id: row.id,
    title: row.title,
    body: row.body,
    itemId: row.item_id ?? undefined,
  };
}

/** Watch for new in-app reminder rows and surface a popup + chime (FIFO queue). */
export function useReminderAlerts(userId: string | null | undefined, enabled: boolean) {
  const [alert, setAlert] = useState<ReminderAlertItem | null>(null);
  const queueRef = useRef<ReminderAlertItem[]>([]);
  const seenIds = useRef(new Set<string>());
  const bootstrapped = useRef(false);
  const showingRef = useRef(false);

  function presentNext() {
    if (showingRef.current) return;
    const next = queueRef.current.shift() ?? null;
    if (!next) {
      setAlert(null);
      return;
    }
    showingRef.current = true;
    setAlert(next);
    playReminderChime();
    showBrowserReminderNotification(next.title, next.body);
  }

  function enqueue(items: ReminderAlertItem[]) {
    for (const item of items) {
      if (seenIds.current.has(item._id)) continue;
      if (wasLocallyPresentedNotification(item._id)) {
        seenIds.current.add(item._id);
        continue;
      }
      seenIds.current.add(item._id);
      queueRef.current.push(item);
    }
    presentNext();
  }

  useEffect(() => {
    bootstrapped.current = false;
    seenIds.current.clear();
    queueRef.current = [];
    showingRef.current = false;
    setAlert(null);
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId) return;

    let cancelled = false;

    async function loadInitial() {
      try {
        const rows = await listUserNotifications(15);
        if (cancelled) return;
        for (const row of rows) seenIds.current.add(row.id);
        bootstrapped.current = true;
      } catch {
        bootstrapped.current = true;
      }
    }

    void loadInitial();

    const unsubscribe = subscribeUserNotifications(userId, () => {
      void listUserNotifications(15)
        .then((rows) => {
          if (cancelled || !bootstrapped.current) return;
          const fresh = rows
            .filter((row) => !row.read && !seenIds.current.has(row.id))
            .map(toAlertItem);
          if (fresh.length > 0) enqueue(fresh);
        })
        .catch(() => {
          /* ignore polling errors */
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, userId]);

  function dismiss() {
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  async function acknowledge() {
    if (!alert) return;
    try {
      await markNotificationRead(alert._id);
    } catch (error) {
      console.warn(
        "[reminder-alert] markRead failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  return { alert, dismiss, acknowledge };
}
