import { createPortal } from "react-dom";

import type { ReminderAlertItem } from "../hooks/useReminderAlerts";
import type { AlertSnoozeKind } from "../lib/resolve-item-reminder";

interface ReminderAlertModalProps {
  alert: ReminderAlertItem | null;
  onDismiss: () => void;
  onAcknowledge: () => void;
  onOpen?: () => void;
  onComplete?: () => void;
  onSnooze?: (kind: AlertSnoozeKind) => void;
}

export function ReminderAlertModal({
  alert,
  onDismiss,
  onAcknowledge,
  onOpen,
  onComplete,
  onSnooze,
}: ReminderAlertModalProps) {
  if (!alert) return null;

  const canSnooze = Boolean(onSnooze && alert.itemId);

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reminder-alert-title"
        aria-describedby="reminder-alert-body"
        className="w-full max-w-sm animate-[reminderPop_280ms_ease-out] rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            תזכורת
          </p>
          <span aria-hidden className="text-2xl">
            🔔
          </span>
        </div>
        <h2 id="reminder-alert-title" className="text-lg font-bold text-slate-900">
          {alert.title}
        </h2>
        <p
          id="reminder-alert-body"
          className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600"
        >
          {alert.body}
        </p>
        <div className="mt-5 flex flex-row-reverse flex-wrap justify-start gap-2">
          {onComplete ? (
            <button
              type="button"
              onClick={() => {
                onComplete();
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              בוצע
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onAcknowledge();
              onOpen?.();
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            פתח
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            סמן כנקרא
          </button>
        </div>
        {canSnooze ? (
          <div className="mt-3 border-t border-amber-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">דחה למועד אחר</p>
            <div className="flex flex-row-reverse flex-wrap justify-start gap-2">
              <button
                type="button"
                onClick={() => onSnooze?.("hour")}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                עוד שעה
              </button>
              <button
                type="button"
                onClick={() => onSnooze?.("tomorrow")}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                מחר ב-09:00
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 rounded-lg border border-transparent px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            מאוחר יותר
          </button>
        )}
      </div>
      <style>{`
        @keyframes reminderPop {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
