import { useEffect, useMemo, useState } from "react";

import { DateDdMmYyyyInput } from "./DateDdMmYyyyInput";
import { loadSystemActivityItems } from "../lib/system-activity-load";
import {
  buildActivityEvents,
  downloadActivityExcel,
  filterActivityEvents,
  formatActivityWhen,
  type SystemActivityEvent,
  type SystemActivityKind,
} from "../lib/system-activity";

interface SystemActivityPanelProps {
  open: boolean;
  userId: string;
  ownerName: string;
  onClose: () => void;
  onOpenItem?: (itemId: string) => void;
}

const KIND_CLASS: Record<SystemActivityKind, string> = {
  created: "bg-sky-50 text-sky-800 border-sky-200",
  updated: "bg-stone-50 text-stone-700 border-stone-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  archived: "bg-amber-50 text-amber-800 border-amber-200",
  deleted: "bg-rose-50 text-rose-800 border-rose-200",
};

export function SystemActivityPanel({
  open,
  userId,
  ownerName,
  onClose,
  onOpenItem,
}: SystemActivityPanelProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<SystemActivityEvent[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(undefined);
    setError(null);
    void loadSystemActivityItems(userId)
      .then((items) => {
        if (cancelled) return;
        setRows(buildActivityEvents(items, ownerName));
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "טעינת הפעילות נכשלה");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, ownerName]);

  const visible = useMemo(
    () => filterActivityEvents(rows ?? [], { from, to }),
    [rows, from, to],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-end bg-black/30 p-3 sm:p-4"
      onClick={onClose}
      role="presentation"
      data-babitk-activity="overlay"
    >
      <div
        className="mt-12 w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="system-activity-title"
        dir="rtl"
        data-babitk-activity="panel"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 id="system-activity-title" className="text-sm font-bold text-stone-900">
            לוח פעילות
          </h2>
          <button
            type="button"
            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
            onClick={onClose}
          >
            סגור
          </button>
        </div>

        <div className="system-activity-filters border-b border-stone-100 px-4 py-3">
          <div className="system-activity-dates" data-babitk-activity="dates">
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-stone-500">
              מתאריך
              <DateDdMmYyyyInput
                value={from}
                onChange={setFrom}
                className="w-full min-w-0 bg-white text-xs text-stone-800"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-stone-500">
              עד תאריך
              <DateDdMmYyyyInput
                value={to}
                onChange={setTo}
                min={from || undefined}
                className="w-full min-w-0 bg-white text-xs text-stone-800"
              />
            </label>
          </div>
          <button
            type="button"
            className="system-activity-export rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            disabled={!visible.length}
            onClick={() => downloadActivityExcel(visible, { from, to })}
          >
            ייצוא לאקסל
          </button>
        </div>

        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
          {rows === undefined ? (
            <p className="py-8 text-center text-sm text-stone-500">טוען פעילות…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">אין פעילות בטווח שנבחר</p>
          ) : (
            <>
              <p className="px-1 text-[11px] text-stone-400">{visible.length} פעולות</p>
              {visible.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="w-full rounded-lg border border-stone-200 bg-white p-3 text-right transition hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-white"
                  disabled={!event.canOpen}
                  onClick={() => {
                    if (!event.canOpen) return;
                    onOpenItem?.(event.itemId);
                    onClose();
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${KIND_CLASS[event.kind]}`}
                    >
                      {event.kindLabel}
                    </span>
                    <span className="text-[11px] text-stone-400" dir="ltr">
                      {formatActivityWhen(event.at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-stone-900">{event.title}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    {event.actor} · {event.sourceLabel} · {event.locationLabel}
                  </p>
                  {event.detail ? (
                    <p className="mt-1 text-[11px] leading-5 text-stone-400">{event.detail}</p>
                  ) : null}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
