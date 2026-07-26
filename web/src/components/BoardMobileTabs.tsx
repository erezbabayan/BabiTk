import { BOARD_TAB_LABELS, withItemCount, type BoardTab } from "../lib/board-labels";

interface BoardMobileTabsProps {
  active: BoardTab;
  onChange: (tab: BoardTab) => void;
  counts: Record<BoardTab, number>;
}

const TAB_CLASS: Record<BoardTab, { base: string; active: string; text: string; textActive: string }> = {
  inbox: {
    base: "border-slate-200 bg-white border-t-slate-200",
    active: "border-2 border-slate-300 border-t-[3px] border-t-slate-300 shadow-sm",
    text: "text-slate-500",
    textActive: "text-slate-800",
  },
  today: {
    base: "border-blue-200 bg-blue-50 border-t-blue-500",
    active: "border-2 border-blue-500 border-t-[3px] border-t-blue-600 bg-blue-100 shadow-sm shadow-blue-500/20",
    text: "text-blue-600",
    textActive: "text-blue-800",
  },
  notes: {
    base: "border-orange-200 bg-orange-50 border-t-orange-500",
    active: "border-2 border-orange-500 border-t-[3px] border-t-orange-600 bg-orange-100 shadow-sm shadow-orange-500/20",
    text: "text-orange-600",
    textActive: "text-orange-800",
  },
};

/** Mobile/Android web board tabs — desktop (mouse) shows all three boards instead. */
export function BoardMobileTabs({ active, onChange, counts }: BoardMobileTabsProps) {
  return (
    <div
      className="mt-3 mb-2 flex w-full shrink-0 flex-row gap-2 px-4"
      role="tablist"
      aria-label="לוחות"
      data-board-tabs="mobile-single"
    >
      {(["inbox", "today", "notes"] as const).map((tab) => {
        const selected = active === tab;
        const tone = TAB_CLASS[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={`font-board-tab flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-[10px] border border-t-[3px] px-1 py-2 text-center text-[11px] leading-tight transition ${
              tone.base
            } ${selected ? tone.active : ""}`}
          >
            <span
              className={`whitespace-nowrap ${selected ? tone.textActive : tone.text} ${
                selected ? "font-semibold" : "font-medium"
              }`}
            >
              {withItemCount(BOARD_TAB_LABELS[tab], counts[tab])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
