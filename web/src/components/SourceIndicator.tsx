import type { MindtaskerItem } from "../types";
import { MANUAL_SOURCE_DISPLAY } from "../lib/source-display";
import { resolveItemSource } from "../lib/item-source";
import { NotebookIcon } from "./NotebookIcons";
import type { NotebookIconTone } from "./NotebookIcons";
import { ITEM_ACTION_ATTR } from "./SwipeableItemCard";

interface SourceIndicatorProps {
  item: MindtaskerItem;
  onOpen: () => void;
  compact?: boolean;
  iconOnly?: boolean;
  isOpen?: boolean;
  tone?: NotebookIconTone;
}

function sourceTone(isOpen: boolean, canOpen: boolean): NotebookIconTone {
  if (!canOpen) return "muted";
  return isOpen ? "slate" : "neutral";
}

export function SourceIndicator({
  item,
  onOpen,
  compact = false,
  iconOnly = false,
  isOpen = false,
  tone,
}: SourceIndicatorProps) {
  const source = resolveItemSource(item);
  const iconTone = tone ?? sourceTone(isOpen, source.canOpen);

  if (!source.canOpen) {
    if (iconOnly) {
      return (
        <span
          className="notebook-icon-btn notebook-icon-btn--muted"
          title={MANUAL_SOURCE_DISPLAY.label}
          aria-hidden
        >
          <NotebookIcon name={MANUAL_SOURCE_DISPLAY.icon} size={14} tone={iconTone} />
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-400 ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
        }`}
        title={`אין מקור שמור — ${MANUAL_SOURCE_DISPLAY.label}`}
      >
        <NotebookIcon name={MANUAL_SOURCE_DISPLAY.icon} size={12} tone="muted" />
        <span>{MANUAL_SOURCE_DISPLAY.label}</span>
      </span>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        {...{ [ITEM_ACTION_ATTR]: "" }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={`notebook-icon-btn ${isOpen ? "notebook-icon-btn--active" : ""}`}
        title={isOpen ? "סגור מקור" : `${source.label} — צפייה במקור`}
        aria-label={isOpen ? "סגור מקור" : `${source.label} — צפייה במקור`}
        aria-pressed={isOpen}
      >
        <NotebookIcon name={source.icon} size={14} tone={iconTone} />
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
      <NotebookIcon name={source.icon} size={12} tone={iconTone} />
      <span>{source.label}</span>
    </button>
  );
}
