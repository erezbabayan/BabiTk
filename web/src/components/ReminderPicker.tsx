import { useEffect, useState } from "react";
import type { MindtaskerItem } from "../types";
import { snoozePresets } from "../hooks/useItems";
import { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";
import { isReminderActive } from "../lib/item-display";
import {
  effectiveTaskDueDate,
  getReminderFlags,
  getReminderRecurrence,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";
import { DueDateFields } from "./DueDateFields";
import { ReminderRecurrenceChips } from "./ReminderRecurrenceChips";

interface ReminderPickerProps {
  item: MindtaskerItem;
  onSelect: (
    item: MindtaskerItem,
    due: string,
    recurrence?: ReminderRecurrence | null,
  ) => void;
  onClear: (item: MindtaskerItem) => void;
  onClose: () => void;
}

function initialDueParts(item: MindtaskerItem): DueDateParts {
  if (getReminderFlags(item.metadata).disabled) {
    return splitDueDate(null);
  }
  return splitDueDate(effectiveTaskDueDate(item));
}

export function ReminderPicker({ item, onSelect, onClear, onClose }: ReminderPickerProps) {
  const presets = snoozePresets();
  const options = [
    { label: "בעוד דקה", value: presets.in1Minute },
    { label: "עוד 3 שעות", value: presets.in3Hours },
    { label: "מחר בבוקר", value: presets.tomorrowMorning },
    { label: "שבוע הבא", value: presets.nextWeek },
  ];

  const [dueParts, setDueParts] = useState<DueDateParts>(() => initialDueParts(item));
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(() =>
    getReminderRecurrence(item.metadata),
  );
  const customIso = combineDueDate(dueParts);
  const hasReminder = isReminderActive(item);

  useEffect(() => {
    setDueParts(initialDueParts(item));
    setRecurrence(getReminderRecurrence(item.metadata));
  }, [item.id, item.due_date, item.metadata]);

  function commit(iso: string) {
    onSelect(item, iso, recurrence);
    onClose();
  }

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
        aria-labelledby="reminder-picker-title"
      >
        <p id="reminder-picker-title" className="mb-2 text-sm font-semibold text-slate-900">
          תזכורת — {item.title}
        </p>

        <div className="mb-2">
          <ReminderRecurrenceChips value={recurrence} onChange={setRecurrence} />
        </div>

        <div className="space-y-1">
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => commit(opt.value)}
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
              commit(customIso);
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
              onClear(item);
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
