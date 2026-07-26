import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  playReminderChime,
  showBrowserReminderNotification,
} from "../lib/reminder-chime";

export type ReminderAlertItem = {
  _id: Id<"notifications">;
  title: string;
  body: string;
  taskId?: Id<"tasks">;
  notebookId?: Id<"notebooks">;
  listId?: Id<"taskLists">;
};

type NotificationRow = ReminderAlertItem & {
  read: boolean;
};

function toAlertItem(row: {
  _id: Id<"notifications">;
  title: string;
  body: string;
  taskId?: Id<"tasks">;
  notebookId?: Id<"notebooks">;
  listId?: Id<"taskLists">;
}): ReminderAlertItem {
  return {
    _id: row._id,
    title: row.title,
    body: row.body,
    taskId: row.taskId,
    notebookId: row.notebookId,
    listId: row.listId,
  };
}

/** Watch for new in-app reminder rows and surface a popup + chime (FIFO queue). */
export function useReminderAlerts(userId: Id<"users"> | undefined, enabled: boolean) {
  const rows = useQuery(
    api.notifications.listMine,
    enabled && userId ? { userId, limit: 15 } : "skip",
  ) as NotificationRow[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
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

  // Permission is requested from explicit UI (bell / settings), not on mount —
  // Android Chrome often blocks prompt without a user gesture.

  useEffect(() => {
    if (!rows) return;

    if (!bootstrapped.current) {
      // Seed seen with whatever we already have so reconnects don't flood.
      for (const row of rows) seenIds.current.add(row._id);
      bootstrapped.current = true;
      return;
    }

    const fresh = rows
      .filter((row) => !row.read && !seenIds.current.has(row._id))
      .map(toAlertItem);
    if (fresh.length === 0) return;
    enqueue(fresh);
  }, [rows]);

  function dismiss() {
    showingRef.current = false;
    setAlert(null);
    queueMicrotask(() => presentNext());
  }

  async function acknowledge() {
    if (!alert) return;
    try {
      await markRead({ notificationId: alert._id });
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
