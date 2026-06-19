import type { MindtaskerItem } from "../types";
import { resolveItemSource } from "../lib/item-source";

interface SourceIndicatorProps {
  item: MindtaskerItem;
  onOpen: () => void;
  compact?: boolean;
  iconOnly?: boolean;
  isOpen?: boolean;
}

export function SourceIndicator({
  item,
  onOpen,
  compact = false,
  iconOnly = false,
  isOpen = false,
}: SourceIndicatorProps) {
  const source = resolveItemSource(item);

  if (!source.canOpen) {
    if (iconOnly) {
      return (
        <span className="shrink-0 text-[10px] text-slate-300" title="ידני" aria-hidden>
          ✏️
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-400 ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
        }`}
        title="אין מקור שמור"
      >
        <span aria-hidden>✏️</span>
        <span>ידני</span>
      </span>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`shrink-0 rounded px-0.5 text-[10px] leading-none hover:bg-slate-100 ${
          isOpen ? "bg-slate-200 text-slate-800" : "text-slate-500"
        }`}
        title={isOpen ? "סגור מקור" : `${source.label} — צפייה במקור`}
        aria-label={isOpen ? "סגור מקור" : `${source.label} — צפייה במקור`}
        aria-pressed={isOpen}
      >
        {source.icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
      title={`מקור: ${source.label} — לחץ לצפייה`}
    >
      <span aria-hidden>{source.icon}</span>
      <span>{source.label}</span>
      <span className="text-slate-400" aria-hidden>
        👁
      </span>
    </button>
  );
}
