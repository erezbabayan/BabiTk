import {
  TIME_PRESETS,
  type DueDateParts,
} from "../lib/due-date-fields";
import { ClockTimePicker } from "./ClockTimePicker";

const FIELD_CLASS =
  "w-full !rounded-md !border-slate-300 bg-white !px-2 !py-1.5 !text-[12px] !leading-snug text-slate-900 shadow-sm outline-none transition focus:!border-blue-400 focus:!ring-1 focus:!ring-blue-100";

const FIELD_CLASS_COMPACT =
  "w-full !rounded-md !border-slate-300 bg-white !px-2 !py-1 !text-[11px] !leading-tight text-slate-900 shadow-sm outline-none transition focus:!border-blue-400 focus:!ring-1 focus:!ring-blue-100";

interface DueDateFieldsProps {
  value: DueDateParts;
  onChange: (value: DueDateParts) => void;
  minDateToday?: boolean;
  compact?: boolean;
}

function todayDateValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isPresetActive(value: DueDateParts, preset: (typeof TIME_PRESETS)[number]): boolean {
  return value.hour === preset.hour && value.minute === preset.minute;
}

export function DueDateFields({
  value,
  onChange,
  minDateToday = false,
  compact = false,
}: DueDateFieldsProps) {
  const hasDate = value.date.length > 0;
  const fieldClass = compact ? FIELD_CLASS_COMPACT : FIELD_CLASS;

  function clearDate() {
    onChange({ date: "", hour: "09", minute: "00" });
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <label className={`font-medium text-slate-600 ${compact ? "text-[10px]" : "text-xs"}`}>
          תאריך יעד
        </label>
        {hasDate ? (
          <button
            type="button"
            onClick={clearDate}
            className="!rounded-none !border-0 !bg-transparent !p-0 !text-[10px] !font-medium text-slate-500 hover:text-slate-700"
          >
            נקה
          </button>
        ) : null}
      </div>

      <div className={compact ? "grid grid-cols-2 gap-1.5" : "space-y-3"}>
        <div>
          <span className={`mb-0.5 block text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            תאריך
          </span>
          <input
            type="date"
            value={value.date}
            min={minDateToday ? todayDateValue() : undefined}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            className={fieldClass}
            dir="ltr"
          />
        </div>

        <div>
          <span className={`mb-0.5 block text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            שעה
          </span>
          <ClockTimePicker
            hour={value.hour.padStart(2, "0")}
            minute={value.minute.padStart(2, "0")}
            onChange={(hour, minute) => onChange({ ...value, hour, minute })}
            disabled={!hasDate}
            compact={compact}
          />
        </div>
      </div>

      <div>
        <span className={`mb-0.5 block text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          זמנים נפוצים
        </span>
        <div className={`flex flex-wrap justify-end ${compact ? "gap-1" : "gap-1.5"}`}>
          {TIME_PRESETS.map((preset) => {
            const active = hasDate && isPresetActive(value, preset);
            return (
              <button
                key={preset.label}
                type="button"
                disabled={!hasDate}
                onClick={() =>
                  onChange({ ...value, hour: preset.hour, minute: preset.minute })
                }
                className={`rounded-full border font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  compact ? "px-1.5 py-px text-[9px]" : "px-2.5 py-1 text-[11px]"
                } ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {compact ? preset.label : `${preset.label} · ${preset.hour}:${preset.minute}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
