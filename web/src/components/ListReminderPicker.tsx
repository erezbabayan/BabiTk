import { useEffect, useState } from "react";

import { formatListReminderAt, isListReminderActive } from "../../../convex/lib/taskListNames";
import { snoozePresets } from "../hooks/useItems";
import { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";
import { DueDateFields } from "./DueDateFields";

interface ListReminderPickerProps {
  listName: string;
  reminderAt: string | null;
  onSelect: (due: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ListReminderPicker({
  listName,
  reminderAt,
  onSelect,
  onClear,
  onClose,
}: ListReminderPickerProps) {
  const presets = snoozePresets();
  const options = [
    { label: "עוד 3 שעות", value: presets.in3Hours },
    { label: "מחר בבוקר", value: presets.tomorrowMorning },
    { label: "שבוע הבא", value: presets.nextWeek },
  ];

  const [dueParts, setDueParts] = useState<DueDateParts>(() => splitDueDate(reminderAt));
  const customIso = combineDueDate(dueParts);
  const hasReminder = isListReminderActive(reminderAt);

  useEffect(() => {
    setDueParts(splitDueDate(reminderAt));
  }, [reminderAt, listName]);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-reminder-picker-title"
      >
        <p id="list-reminder-picker-title" className="mb-2 text-sm font-semibold text-slate-900">
          תזכורת לרשימה — {listName}
        </p>

        {hasReminder && reminderAt ? (
          <p className="mb-2 text-xs text-red-600">
            תזכורת פעילה: {formatListReminderAt(reminderAt)}
          </p>
        ) : null}

        <div className="space-y-1">
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                onClose();
              }}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-right text-xs text-slate-700 hover:bg-slate-50"
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-2 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] font-medium text-slate-500">או בחר מתאריך ביומן</p>
          <DueDateFields value={dueParts} onChange={setDueParts} minDateToday compact />
          <button
            type="button"
            disabled={!customIso}
            onClick={() => {
              if (!customIso) return;
              onSelect(customIso);
              onClose();
            }}
            className="mt-2 w-full rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            שמור תזכורת
          </button>
        </div>

        {hasReminder ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="mt-2 w-full rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            ביטול תזכורת
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-1 text-xs text-slate-500 hover:text-slate-700"
        >
          סגור
        </button>
      </div>
    </div>
  );
}
