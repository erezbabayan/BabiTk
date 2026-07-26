import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ConfirmVariant = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Matches mobile app ConfirmDialog: compact, centered text, system cream + orange.
 */
export function ConfirmDialog({
  open,
  title = "אישור",
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";
  const messageLines = message.split("\n").filter((line) => line.length > 0);

  const confirmClass = isDanger
    ? "min-w-[4.5rem] rounded-lg border border-orange-700/40 bg-[#ea580c] px-3 py-1.5 text-center text-xs font-bold text-white hover:bg-[#c2410c]"
    : "min-w-[4.5rem] rounded-lg border border-stone-800 bg-stone-900 px-3 py-1.5 text-center text-xs font-bold text-white hover:bg-stone-800";

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-stone-900/35 px-10 py-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="flex w-full max-w-[280px] flex-col items-center rounded-[14px] border border-stone-300/70 bg-[#fffefb] px-3.5 py-3.5 text-center shadow-lg ring-1 ring-stone-200/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`mb-2.5 h-[3px] w-9 rounded-full ${
            isDanger ? "bg-[#f97316]" : "bg-stone-400"
          }`}
          aria-hidden
        />
        <h2
          id="confirm-dialog-title"
          className="w-full text-center text-[15px] font-bold tracking-tight text-stone-900"
        >
          {title}
        </h2>
        <div id="confirm-dialog-message" className="mt-1.5 w-full space-y-1">
          {messageLines.map((line, index) => (
            <p
              key={`${index}-${line.slice(0, 12)}`}
              className={`text-center text-xs leading-[1.35] ${
                index > 0 ? "text-stone-500" : "text-stone-600"
              }`}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="mt-3.5 flex w-full flex-row-reverse items-center justify-center gap-2">
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[4.5rem] rounded-lg border border-stone-300/80 bg-white px-3 py-1.5 text-center text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
