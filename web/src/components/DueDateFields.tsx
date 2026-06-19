import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  type DueDateParts,
} from "../lib/due-date-fields";

const FIELD_CLASS =
  "w-full !rounded-md !border-slate-300 bg-white !px-2.5 !py-1.5 !text-[13px] !leading-snug text-slate-900 shadow-sm outline-none transition focus:!border-blue-400 focus:!ring-1 focus:!ring-blue-100";

const SELECT_CLASS = `${FIELD_CLASS} !w-[3.25rem] !px-1.5 !py-1.5 text-center`;

interface DueDateFieldsProps {
  value: DueDateParts;
  onChange: (value: DueDateParts) => void;
}

export function DueDateFields({ value, onChange }: DueDateFieldsProps) {
  const hasDate = value.date.length > 0;

  function clearDate() {
    onChange({ date: "", hour: "09", minute: "00" });
  }

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600">תאריך יעד</label>
        {hasDate ? (
          <button
            type="button"
            onClick={clearDate}
            className="!rounded-none !border-0 !bg-transparent !p-0 !text-[11px] !font-medium text-slate-500 hover:text-slate-700"
          >
            נקה
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <span className="mb-0.5 block text-[10px] text-slate-500">תאריך</span>
          <input
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            className={FIELD_CLASS}
            dir="ltr"
          />
        </div>
        <div>
          <span className="mb-0.5 block text-[10px] text-slate-500">שעה</span>
          <div className="flex items-center gap-1" dir="ltr">
            <select
              value={value.hour}
              onChange={(e) => onChange({ ...value, hour: e.target.value })}
              className={SELECT_CLASS}
              disabled={!hasDate}
              aria-label="שעה"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-500">:</span>
            <select
              value={value.minute}
              onChange={(e) => onChange({ ...value, minute: e.target.value })}
              className={SELECT_CLASS}
              disabled={!hasDate}
              aria-label="דקות"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
