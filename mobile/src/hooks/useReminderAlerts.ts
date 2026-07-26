import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as Notifications from "expo-notifications";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { presentImmediateReminderAlert } from "../lib/reminder-alert";

export type ReminderAlertItem = {
  _id: Id<"notifications">;
  title: string;
  body: string;
  taskId?: Id<"tasks">;
  notebookId?: Id<"notebooks">;
  listId?: Id<"taskLists">;
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

/** Watch for new Convex reminder rows and present OS sound + in-app dialog (FIFO queue). */
export function useReminderAlerts(userId: Id<"users"> | undefined, enabled: boolean) {
  const rows = useQuery(
    api.notifications.listMine,
    enabled && userId ? { userId, limit: 15 } : "skip",
  );
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
    // Tag so the OS-notification listener does not re-enqueue this same alert
    // (that would create an endless echo of local-* ids).
    void presentImmediateReminderAlert({
      title: next.title,
      body: next.body,
      data: {
        notificationId: next._id,
        source: "in_app_echo",
        ...(next.taskId ? { taskId: next.taskId } : {}),
        ...(next.notebookId ? { notebookId: next.notebookId } : {}),
        ...(next.listId ? { listId: next.listId } : {}),
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
      // Skip OS notifications we fired ourselves for the in-app modal.
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
      enqueue([
        {
          _id: notificationId as Id<"notifications">,
          title,
          body,
          ...(typeof data?.taskId === "string"
            ? { taskId: data.taskId as Id<"tasks"> }
            : {}),
          ...(typeof data?.notebookId === "string"
            ? { notebookId: data.notebookId as Id<"notebooks"> }
            : {}),
          ...(typeof data?.listId === "string"
            ? { listId: data.listId as Id<"taskLists"> }
            : {}),
        },
      ]);
    });

    return () => {
      sub.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!rows) return;

    if (!bootstrapped.current) {
      bootstrapped.current = true;
      const recentCutoff = Date.now() - 10 * 60 * 1000;
      for (const row of rows) {
        if (row.read || row.createdAt < recentCutoff) {
          seenIds.current.add(row._id);
        }
      }
      const recentUnread = rows
        .filter((row) => !row.read && row.createdAt >= recentCutoff)
        .map(toAlertItem);
      enqueue(recentUnread);
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
    const isLocal = String(alert._id).startsWith("local-");
    if (!isLocal) {
      try {
        await markRead({ notificationId: alert._id });
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
