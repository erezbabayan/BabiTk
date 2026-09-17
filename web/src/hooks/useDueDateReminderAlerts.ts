import { useEffect, useMemo, useRef, useState } from "react";

import type { ReminderAlertItem } from "./useReminderAlerts";
import {
  formatReminderAlertBody,
  isItemDueForReminder,
  nextUpcomingReminderDelayMs,
  reminderAlertId,
  resolveItemReminderFireAt,
  type ReminderSourceItem,
} from "../lib/due-date-reminder";
import {
  playReminderChime,
  showBrowserReminderNotification,
} from "../lib/reminder-chime";
import {
  insertUserNotification,
  rememberLocallyPresentedNotification,
} from "../lib/user-notifications";

const POLL_MS = 15_000;
const MAX_TIMER_MS = 2_147_000_000;

export type DueDateReminderItem = ReminderSourceItem;

/**
 * Watch open tasks and fire an in-app reminder (popup + chime + browser
 * notification) when the due date arrives. Used on the GitHub Pages /
 * Supabase path where Convex reminder cron is not running.
 */
export function useDueDateReminderAlerts(
  items: DueDateReminderItem[],
  enabled: boolean,
  onFired?: (item: DueDateReminderItem, fireAt: string) => void | Promise<void>,
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
    playReminderChime();
    showBrowserReminderNotification(next.title, next.body);
  }

  function enqueue(next: ReminderAlertItem[]) {
    for (const item of next) {
      if (seenIds.current.has(item._id)) continue;
      seenIds.current.add(item._id);
      queueRef.current.push(item);
    }
    presentNext();
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
      if (seenIds.current.has(id)) continue;
      due.push({
        _id: id,
        title: item.title || "תזכורת",
        body: formatReminderAlertBody(item, fireAt),
        itemId: item.id,
      });
      if (!persistedIds.current.has(id)) {
        persistedIds.current.add(id);
        void Promise.resolve(onFiredRef.current?.(item, fireAt)).catch(() => {
          persistedIds.current.delete(id);
        });
        void insertUserNotification({
          title: item.title || "תזכורת",
          body: formatReminderAlertBody(item, fireAt),
          itemId: item.id,
        })
          .then((row) => {
            if (row?.id) rememberLocallyPresentedNotification(row.id);
          })
          .catch(() => {
            /* Bell history is best-effort when the table is not migrated yet. */
          });
      }
    }
    if (due.length > 0) enqueue(due);
  }

  useEffect(() => {
    if (!enabled) {
      queueRef.current = [];
      showingRef.current = false;
      setAlert(null);
      return;
    }

    scan();

    const interval = window.setInterval(scan, POLL_MS);

    function onVisibility() {
      if (!document.hidden) scan();
    }
    document.addEventListener("visibilitychange", onVisibility);

    const upcoming = nextUpcomingReminderDelayMs(itemsRef.current);
    let timeout: number | undefined;
    if (upcoming !== null) {
      timeout = window.setTimeout(scan, Math.min(Math.max(upcoming, 250), MAX_TIMER_MS));
    }

    return () => {
      window.clearInterval(interval);
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, itemKey]);

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
