import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { formatItemTime } from "../lib/item-display";
import {
  HEBREW_WEEKDAYS,
  calendarMonthExpandRange,
  calendarMonthFromYmd,
  calendarSwipeMonthDelta,
  groupCalendarTasksByDay,
  hebrewMonthTitle,
  monthGrid,
  shiftMonth,
  taskCalendarDayKey,
} from "../lib/task-calendar";
import type { MindtaskerItem } from "../types";

interface TaskMonthCalendarProps {
  items: MindtaskerItem[];
  focusYmd?: string | null;
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
  focusYmd = null,
  onSelectItem,
  compact = false,
}: TaskMonthCalendarProps) {
  const todayYmd = taskCalendarDayKey(new Date()) ?? "";
  const [{ year, month }, setCursor] = useState(initialMonth);
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);

  useEffect(() => {
    if (!focusYmd) return;
    const next = calendarMonthFromYmd(focusYmd);
    if (!next) return;
    setCursor(next);
    setSelectedYmd(focusYmd);
  }, [focusYmd]);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const expandRange = useMemo(
    () => calendarMonthExpandRange(year, month),
    [year, month],
  );
  const byDay = useMemo(
    () => groupCalendarTasksByDay(items, expandRange),
    [items, expandRange],
  );
  const selectedTasks = byDay.get(selectedYmd) ?? [];
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthTaskCount = useMemo(() => {
    const ids = new Set<string>();
    for (const [ymd, list] of byDay) {
      if (!ymd.startsWith(monthPrefix)) continue;
      for (const entry of list) ids.add(entry.item.id);
    }
    return ids.size;
  }, [byDay, monthPrefix]);

  const goMonth = useCallback(
    (delta: number) => {
      const next = shiftMonth(year, month, delta);
      const prefix = `${next.year}-${String(next.month).padStart(2, "0")}`;
      const busyDays = [...byDay.keys()].filter((ymd) => ymd.startsWith(prefix)).sort();
      setCursor(next);
      setSelectedYmd((ymd) => (ymd.startsWith(prefix) ? ymd : busyDays[0] ?? `${prefix}-01`));
    },
    [byDay, month, year],
  );

  const swipe = useRef({
    active: false,
    locked: null as boolean | null,
    x: 0,
    y: 0,
  });
  const suppressClick = useRef(false);

  function onSwipePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    swipe.current = { active: true, locked: null, x: event.clientX, y: event.clientY };
  }

  function onSwipePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!swipe.current.active) return;
    const dx = event.clientX - swipe.current.x;
    const dy = event.clientY - swipe.current.y;
    if (swipe.current.locked === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      swipe.current.locked = horizontal;
      if (!horizontal) {
        swipe.current.active = false;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (swipe.current.locked) event.preventDefault();
  }

  function endSwipePointer(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const started = swipe.current.active;
    const locked = swipe.current.locked;
    const dx = event.clientX - swipe.current.x;
    swipe.current = { active: false, locked: null, x: 0, y: 0 };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!commit || !started || locked !== true) return;
    const delta = calendarSwipeMonthDelta(dx);
    if (!delta) return;
    suppressClick.current = true;
    goMonth(delta);
  }

  function onSwipeClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className={`space-y-3 text-sm ${compact ? "" : "min-h-0 flex-1 overflow-y-auto"}`}
      dir="rtl"
      data-babitk-calendar="month"
      data-babitk-calendar-focus={selectedYmd || undefined}
    >
      <div className="flex items-center justify-between gap-2" dir="ltr">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => goMonth(-1)}
          aria-label="חודש קודם"
          data-babitk-calendar-nav="prev"
        >
          ‹
        </button>
        <div className="text-center" dir="rtl">
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
          onClick={() => goMonth(1)}
          aria-label="חודש הבא"
          data-babitk-calendar-nav="next"
        >
          ›
        </button>
      </div>

      <div
        className="grid touch-pan-y grid-cols-7 gap-px rounded-lg border border-slate-200 bg-slate-200 text-center"
        data-babitk-calendar-swipe="true"
        onPointerDown={onSwipePointerDown}
        onPointerMove={onSwipePointerMove}
        onPointerUp={(event) => endSwipePointer(event, true)}
        onPointerCancel={(event) => endSwipePointer(event, false)}
        onClickCapture={onSwipeClickCapture}
      >
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
              data-babitk-calendar-day={cell.ymd}
              data-babitk-calendar-selected={selected ? "true" : undefined}
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
          selectedTasks.map(({ item, dueIso }) => (
            <button
              key={`${item.id}:${dueIso}`}
              type="button"
              onClick={() => onSelectItem?.(item)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right hover:bg-blue-50"
            >
              <span className="min-w-0 truncate font-medium text-slate-800">
                {item.title.trim() || "משימה"}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">
                {formatItemTime(dueIso) ?? ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
