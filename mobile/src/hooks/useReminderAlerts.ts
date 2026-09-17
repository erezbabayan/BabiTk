import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";

import {
  listUserNotifications,
  markNotificationRead,
  subscribeUserNotifications,
  type UserNotification,
} from "../lib/user-notifications";
import { presentImmediateReminderAlert } from "../lib/reminder-alert";

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

/** Watch for new reminder rows and present OS sound + in-app dialog (FIFO queue). */
export function useReminderAlerts(userId: string | undefined, enabled: boolean) {
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

  function enqueue(items: ReminderAlertItem[]) {
    for (const item of items) {
      if (seenIds.current.has(item._id)) continue;
      seenIds.current.add(item._id);
      queueRef.current.push(item);
    }
    pruneSeenIds(seenIds.current);
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
    if (!enabled) return;

    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      if (data?.source === "in_app_echo") return;

      const notificationId =
        typeof data?.notificationId === "string" && data.notificationId
          ? data.notificationId
          : `local-${notification.request.identifier}`;
      if (seenIds.current.has(notificationId)) return;

      const title = notification.request.content.title ?? "תזכורת";
      const body =
        typeof notification.request.content.body === "string"
          ? notification.request.content.body
          : "";
      const itemId =
        typeof data?.itemId === "string"
          ? data.itemId
          : typeof data?.taskId === "string"
            ? data.taskId
            : undefined;
      enqueue([
        {
          _id: notificationId,
          title,
          body,
          itemId,
        },
      ]);
    });

    return () => {
      sub.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;

    void listUserNotifications(15)
      .then((rows) => {
        if (cancelled) return;
        bootstrapped.current = true;
        const recentCutoff = Date.now() - 10 * 60 * 1000;
        for (const row of rows) {
          const created = Date.parse(row.created_at);
          if (row.read || !Number.isFinite(created) || created < recentCutoff) {
            seenIds.current.add(row.id);
          }
        }
        const recentUnread = rows
          .filter((row) => {
            const created = Date.parse(row.created_at);
            return !row.read && Number.isFinite(created) && created >= recentCutoff;
          })
          .map(toAlertItem);
        enqueue(recentUnread);
      })
      .catch(() => {
        bootstrapped.current = true;
      });

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
          /* ignore */
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
    const isLocal = String(alert._id).startsWith("local-");
    if (!isLocal) {
      try {
        await markNotificationRead(alert._id);
      } catch (error) {
        console.warn(
          "[reminder-alert] markRead failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  return { alert, dismiss, acknowledge };
}
