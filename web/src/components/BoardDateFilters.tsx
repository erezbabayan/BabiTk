import type { BoardDateFilter } from "../lib/filter-items";

interface BoardDateFiltersProps {
  value: BoardDateFilter;
  onChange: (next: BoardDateFilter) => void;
}

function chipClass(active: boolean, tone: "blue" | "rose" | "slate"): string {
  const activeTone =
    tone === "blue"
      ? "border-blue-300/90 bg-blue-50 text-blue-800"
      : tone === "rose"
        ? "border-rose-300/90 bg-rose-50 text-rose-800"
        : "border-slate-400/80 bg-slate-100 text-slate-800";
  return `flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:bg-white ${
    active ? activeTone : "border-slate-200/80 bg-white/80 text-slate-600"
  }`;
}

/** Today / overdue / undated chips — shown on every board. */
export function BoardDateFilters({ value, onChange }: BoardDateFiltersProps) {
  function toggle(mode: Exclude<BoardDateFilter, "all">) {
    onChange(value === mode ? "all" : mode);
  }

  return (
    <>
      <button
        type="button"
        data-no-drag-scroll
        onClick={() => toggle("today")}
        className={chipClass(value === "today", "blue")}
        aria-pressed={value === "today"}
        title="הצג פריטים עם תאריך יעד להיום"
      >
        היום
      </button>
      <button
        type="button"
        data-no-drag-scroll
        onClick={() => toggle("overdue")}
        className={chipClass(value === "overdue", "rose")}
        aria-pressed={value === "overdue"}
        title="הצג פריטים שהתאריך שלהם כבר עבר"
      >
        עבר
      </button>
      <button
        type="button"
        data-no-drag-scroll
        onClick={() => toggle("undated")}
        className={chipClass(value === "undated", "slate")}
        aria-pressed={value === "undated"}
        title="הצג פריטים בלי תאריך מוגדר"
      >
        ללא תאריך
      </button>
    </>
  );
}
