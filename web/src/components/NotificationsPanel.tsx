import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface NotificationsPanelProps {
  open: boolean;
  userId: Id<"users">;
  onClose: () => void;
  onOpenItem?: (payload: {
    taskId?: Id<"tasks">;
    notebookId?: Id<"notebooks">;
    listId?: Id<"taskLists">;
  }) => void;
}

type NotificationRow = {
  _id: Id<"notifications">;
  title: string;
  body: string;
  read: boolean;
  fireAt: string;
  taskId?: Id<"tasks">;
  notebookId?: Id<"notebooks">;
  listId?: Id<"taskLists">;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NotificationsPanel({
  open,
  userId,
  onClose,
  onOpenItem,
}: NotificationsPanelProps) {
  const rows = useQuery(
    api.notifications.listMine,
    open ? { userId, limit: 40 } : "skip",
  ) as NotificationRow[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-end bg-black/30 p-3 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mt-12 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="notifications-title"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="notifications-title" className="text-sm font-bold text-slate-900">
            התראות ותזכורות
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              onClick={() => {
                void markAllRead({});
              }}
            >
              סמן הכל כנקרא
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              סגור
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
          {rows === undefined ? (
            <p className="py-8 text-center text-sm text-slate-500">טוען…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">אין התראות עדיין</p>
          ) : (
            rows.map((row) => (
              <button
                key={row._id}
                type="button"
                className={`w-full rounded-lg border p-3 text-right transition hover:bg-slate-50 ${
                  row.read
                    ? "border-slate-200 bg-white"
                    : "border-indigo-200 bg-indigo-50"
                }`}
                onClick={() => {
                  void markRead({ notificationId: row._id });
                  onOpenItem?.({
                    taskId: row.taskId,
                    notebookId: row.notebookId,
                    listId: row.listId,
                  });
                  onClose();
                }}
              >
                <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{row.body}</p>
                <p className="mt-2 text-[11px] text-slate-400" dir="ltr">
                  {formatWhen(row.fireAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
