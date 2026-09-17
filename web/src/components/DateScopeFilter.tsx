import type { BoardDateFilter } from "../lib/filter-items";

interface DateScopeFilterProps {
  value: BoardDateFilter;
  onChange: (value: BoardDateFilter) => void;
}

const CHIPS: Array<{
  id: Exclude<BoardDateFilter, "all">;
  label: string;
  title: string;
  activeClass: string;
}> = [
  {
    id: "today",
    label: "היום",
    title: "הצג פריטים עם תאריך להיום",
    activeClass: "border-blue-300/90 bg-blue-50 text-blue-800",
  },
  {
    id: "overdue",
    label: "עבר",
    title: "הצג פריטים שהתאריך שלהם עבר",
    activeClass: "border-rose-300/90 bg-rose-50 text-rose-800",
  },
  {
    id: "undated",
    label: "ללא תאריך",
    title: "הצג פריטים בלי תאריך מוגדר",
    activeClass: "border-slate-400/90 bg-slate-100 text-slate-800",
  },
];

/** Date-scope chips shown on every board: today, overdue, and no date. */
export function DateScopeFilter({ value, onChange }: DateScopeFilterProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {CHIPS.map((chip) => {
        const active = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            data-no-drag-scroll
            onClick={() => onChange(active ? "all" : chip.id)}
            className={`flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:bg-white ${
              active ? chip.activeClass : "border-slate-200/80 bg-white/80 text-slate-600"
            }`}
            aria-pressed={active}
            title={chip.title}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
