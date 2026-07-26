import { PriorityStar } from "./PriorityStar";

interface PriorityFilterProps {
  active: boolean;
  onToggle: (active: boolean) => void;
}

/** Toggle board list to priority-starred items only. */
export function PriorityFilter({ active, onToggle }: PriorityFilterProps) {
  return (
    <button
      type="button"
      data-no-drag-scroll
      onClick={() => onToggle(!active)}
      className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:bg-white ${
        active
          ? "border-amber-300/90 bg-amber-50 text-amber-800"
          : "border-slate-200/80 bg-white/80 text-slate-600"
      }`}
      aria-pressed={active}
    >
      <PriorityStar active={active} size={14} />
      עדיפות
    </button>
  );
}
