import {
  REMINDER_RECURRENCE_OPTIONS,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";

interface ReminderRecurrenceChipsProps {
  value: ReminderRecurrence | null;
  onChange: (value: ReminderRecurrence | null) => void;
  compact?: boolean;
}

export function ReminderRecurrenceChips({
  value,
  onChange,
  compact = false,
}: ReminderRecurrenceChipsProps) {
  const chipClass = compact
    ? "rounded-full border px-2 py-0.5 text-[10px] font-semibold"
    : "rounded-full border px-2.5 py-1 text-[11px] font-semibold";

  return (
    <div>
      <p className="mb-1 text-right text-[10px] font-medium text-slate-500">חזרתיות</p>
      <div className="flex flex-row-reverse flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`${chipClass} ${
            value === null
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          חד־פעמי
        </button>
        {REMINDER_RECURRENCE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`${chipClass} ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
