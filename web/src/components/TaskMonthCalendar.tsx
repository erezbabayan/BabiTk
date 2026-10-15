import { useMemo, useState } from "react";

import { formatItemTime } from "../lib/item-display";
import {
  HEBREW_WEEKDAYS,
  groupCalendarTasksByDay,
  hebrewMonthTitle,
  monthGrid,
  shiftMonth,
  taskCalendarDayKey,
} from "../lib/task-calendar";
import type { MindtaskerItem } from "../types";

interface TaskMonthCalendarProps {
  items: MindtaskerItem[];
  onSelectItem?: (item: MindtaskerItem) => void;
  compact?: boolean;
}

function initialMonth(now = new Date()): { year: number; month: number } {
  const ymd = taskCalendarDayKey(now) ?? now.toISOString().slice(0, 10);
  return {
    year: Number(ymd.slice(0, 4)),
    month: Number(ymd.slice(5, 7)),
  };
}

export function TaskMonthCalendar({
  items,
  onSelectItem,
  compact = false,
}: TaskMonthCalendarProps) {
  const todayYmd = taskCalendarDayKey(new Date()) ?? "";
  const [{ year, month }, setCursor] = useState(initialMonth);
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => groupCalendarTasksByDay(items), [items]);
  const selectedTasks = byDay.get(selectedYmd) ?? [];
  const monthTaskCount = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    let count = 0;
    for (const [ymd, list] of byDay) {
      if (ymd.startsWith(prefix)) count += list.length;
    }
    return count;
  }, [byDay, year, month]);

  return (
    <div
      className={`space-y-3 text-sm ${compact ? "" : "min-h-0 flex-1 overflow-y-auto"}`}
      dir="rtl"
      data-babitk-calendar="month"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => setCursor((current) => shiftMonth(current.year, current.month, -1))}
          aria-label="חודש קודם"
        >
          ›
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800">{hebrewMonthTitle(year, month)}</p>
          <p className="text-[11px] text-slate-500">
            {monthTaskCount > 0
              ? `${monthTaskCount} משימות עם תאריך בחודש זה`
              : "אין משימות עם תאריך בחודש זה"}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => setCursor((current) => shiftMonth(current.year, current.month, 1))}
          aria-label="חודש הבא"
        >
          ‹
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-lg border border-slate-200 bg-slate-200 text-center">
        {HEBREW_WEEKDAYS.map((label) => (
          <div
            key={label}
            className="bg-slate-50 py-1 text-[10px] font-semibold text-slate-500"
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const count = byDay.get(cell.ymd)?.length ?? 0;
          const selected = cell.ymd === selectedYmd;
          const today = cell.ymd === todayYmd;
          return (
            <button
              key={cell.ymd}
              type="button"
              onClick={() => setSelectedYmd(cell.ymd)}
              className={`relative min-h-[2.75rem] bg-white px-0.5 py-1 text-xs ${
                cell.inMonth ? "text-slate-800" : "text-slate-300"
              } ${selected ? "bg-blue-50 ring-1 ring-inset ring-blue-400" : ""} ${
                today && !selected ? "font-bold text-blue-700" : ""
              }`}
              aria-pressed={selected}
              aria-label={`${cell.ymd}${count ? `, ${count} משימות` : ""}`}
            >
              {cell.day}
              {count > 0 ? (
                <span className="mt-0.5 flex justify-center gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                    <span
                      key={index}
                      className="h-1 w-1 rounded-full bg-blue-500"
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        {selectedTasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
            אין משימות ביום הזה. הוסיפו תאריך למשימה בלוח כדי שתופיע ביומן.
          </p>
        ) : (
          selectedTasks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem?.(item)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right hover:bg-blue-50"
            >
              <span className="min-w-0 truncate font-medium text-slate-800">
                {item.title.trim() || "משימה"}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">
                {formatItemTime(item.due_date) ?? ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
