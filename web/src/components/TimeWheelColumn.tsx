import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import {
  TIME_WHEEL_ITEM_HEIGHT,
  TIME_WHEEL_VISIBLE_ROWS,
  wheelIndexForValue,
} from "../lib/time-wheel-layout";

interface TimeWheelColumnProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel: string;
}

export function TimeWheelColumn({
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
  ariaLabel,
}: TimeWheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, lastY: 0 });
  const snapTimerRef = useRef<number | null>(null);
  const itemHeight = compact ? 22 : TIME_WHEEL_ITEM_HEIGHT;
  const padRows = Math.floor(TIME_WHEEL_VISIBLE_ROWS / 2);

  const scrollToIndex = useCallback(
    (index: number, smooth = false) => {
      const el = ref.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(options.length - 1, index));
      el.scrollTo({ top: clamped * itemHeight, behavior: smooth ? "smooth" : "auto" });
    },
    [itemHeight, options.length],
  );

  const snapToNearest = useCallback(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const idx = Math.round(el.scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    scrollToIndex(clamped, true);
    const next = options[clamped];
    if (next && next !== value) onChange(next);
  }, [disabled, itemHeight, onChange, options, scrollToIndex, value]);

  const scheduleSnap = useCallback(() => {
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      snapToNearest();
    }, 80);
  }, [snapToNearest]);

  useEffect(() => {
    scrollToIndex(wheelIndexForValue(options, value));
  }, [options, scrollToIndex, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      el!.scrollTop += e.deltaY;
      scheduleSnap();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [disabled, scheduleSnap]);

  useEffect(
    () => () => {
      if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
    },
    [],
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    dragRef.current = { active: true, lastY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active || disabled) return;
    const delta = dragRef.current.lastY - e.clientY;
    dragRef.current.lastY = e.clientY;
    const el = ref.current;
    if (!el) return;
    el.scrollTop += delta;
    scheduleSnap();
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    snapToNearest();
  }

  const wheelHeight = itemHeight * TIME_WHEEL_VISIBLE_ROWS;

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-slate-200 bg-white ${
        disabled ? "opacity-40" : ""
      }`}
      style={{ height: wheelHeight }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 border-y border-blue-200 bg-blue-50/40"
        style={{ height: itemHeight }}
        aria-hidden
      />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        className={`h-full overflow-y-auto scroll-smooth select-none ${
          disabled ? "pointer-events-none" : "cursor-grab active:cursor-grabbing"
        } [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        style={{
          paddingTop: padRows * itemHeight,
          paddingBottom: padRows * itemHeight,
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onScroll={scheduleSnap}
      >
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => {
                onChange(option);
                scrollToIndex(wheelIndexForValue(options, option), true);
              }}
              className={`flex w-full items-center justify-center font-medium tabular-nums transition ${
                compact ? "text-[11px]" : "text-[13px]"
              } ${selected ? "text-blue-700" : "text-slate-500 hover:text-slate-700"}`}
              style={{ height: itemHeight }}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
