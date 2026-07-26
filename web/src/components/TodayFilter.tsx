interface TodayFilterProps {
  active: boolean;
  onToggle: (active: boolean) => void;
}

/** Toggle tasks board to items due on the local calendar day. */
export function TodayFilter({ active, onToggle }: TodayFilterProps) {
  return (
    <button
      type="button"
      data-no-drag-scroll
      onClick={() => onToggle(!active)}
      className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:bg-white ${
        active
          ? "border-blue-300/90 bg-blue-50 text-blue-800"
          : "border-slate-200/80 bg-white/80 text-slate-600"
      }`}
      aria-pressed={active}
      title="הצג משימות עם תאריך יעד להיום בלבד"
    >
      היום
    </button>
  );
}
