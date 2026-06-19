import { useState, type DragEvent } from "react";
import type { MindtaskerItem } from "../types";
import { colorForTag, type UserTag } from "../lib/tags";
import { ItemEditModal, type ItemEditInput } from "./ItemEditModal";
import { SourceIndicator } from "./SourceIndicator";
import { SourceInlinePanel } from "./SourceInlinePanel";
import { resolveItemSource } from "../lib/item-source";
import { getItemAnalysis } from "../lib/item-analysis";
import { ItemAnalysisCompact } from "./ItemAnalysisCompact";

import { ITEM_DRAG_HANDLE_ATTR } from "./SwipeableItemCard";

export const ITEM_DRAG_MIME = "application/x-mindtasker-item";

interface ItemCardProps {
  item: MindtaskerItem;
  onEdit?: (input: ItemEditInput) => void | Promise<void>;
  onToggleType?: () => void;
  onComplete?: () => void;
  onSnooze?: () => void;
  compact?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  userTags?: UserTag[];
}

function cardContent(item: MindtaskerItem): string | null {
  const title = item.title.trim();
  const content = item.content.trim();
  if (!content || content === title) return null;
  return content;
}

function formatDueShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IconAction({
  icon,
  label,
  onClick,
  className = "border border-slate-300 hover:bg-white/70",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`shrink-0 !rounded-sm !px-1 !py-0.5 !text-[12px] !font-normal leading-none ${className}`}
    >
      {icon}
    </button>
  );
}

export function ItemCard({
  item,
  onEdit,
  onToggleType,
  onComplete,
  onSnooze,
  compact = true,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  userTags = [],
}: ItemCardProps) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const isNote = !item.is_actionable;
  const sourceInfo = resolveItemSource(item);
  const analysis = getItemAnalysis(item.metadata);
  const extraContent = compact && !showSource ? null : cardContent(item);
  const visibleTags = compact && item.tags.length > 2 ? item.tags.slice(0, 2) : item.tags;
  const hiddenTagCount =
    compact && item.tags.length > visibleTags.length ? item.tags.length - visibleTags.length : 0;

  const hasActions = Boolean(onEdit || onToggleType || onComplete || onSnooze);

  function toggleSource() {
    if (!sourceInfo.canOpen) return;
    setShowSource((open) => !open);
  }

  return (
    <>
      <article
        data-item-drag-root=""
        draggable={draggable && !showSource}
        onDragStart={(e) => {
          onDragStart?.(e);
        }}
        onDragEnd={onDragEnd}
        className={`rounded-md border px-1.5 py-1 transition ${
          isNote ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-sky-50"
        } ${isDragging ? "opacity-40" : ""} ${draggable && !showSource ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className="flex items-start gap-1">
          {draggable ? (
            <span
              {...{ [ITEM_DRAG_HANDLE_ATTR]: "" }}
              className="mt-0.5 shrink-0 select-none text-[10px] text-slate-400"
              aria-hidden
            >
              ⠿
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {isNote ? (
                <span className="shrink-0 text-[10px]" aria-hidden>
                  📌
                </span>
              ) : null}
              <h3 className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-slate-900">
                {item.title}
              </h3>
              <SourceIndicator
                item={item}
                compact
                iconOnly
                isOpen={showSource}
                onOpen={toggleSource}
              />
            </div>

            {showSource ? (
              <SourceInlinePanel item={item} onClose={() => setShowSource(false)} />
            ) : (
              <>
                {extraContent ? (
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-slate-500">
                    {extraContent}
                  </p>
                ) : null}

                <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                  <span
                    className={`rounded px-1 py-px text-[9px] leading-none ${
                      isNote ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {isNote ? "הערה" : "משימה"}
                  </span>
                  {!isNote && item.due_date ? (
                    <span className="rounded bg-blue-50 px-1 py-px text-[9px] leading-none text-blue-700">
                      📅 {formatDueShort(item.due_date)}
                    </span>
                  ) : null}
                  {visibleTags.map((tag) => {
                    const color = colorForTag(tag, userTags, isNote ? "#f59e0b" : "#64748b");
                    return (
                      <span
                        key={tag}
                        className="rounded-full px-1 py-px text-[9px] leading-none"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        #{tag}
                      </span>
                    );
                  })}
                  {hiddenTagCount > 0 ? (
                    <span className="text-[9px] text-slate-400">+{hiddenTagCount}</span>
                  ) : null}
                </div>

                {analysis ? <ItemAnalysisCompact analysis={analysis} /> : null}
              </>
            )}
          </div>
        </div>

        {!showSource && hasActions ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-px border-t border-slate-100 pt-0.5">
            {onEdit ? (
              <IconAction icon="✏️" label="ערוך" onClick={() => setEditing(true)} />
            ) : null}
            {onToggleType ? (
              <IconAction
                icon="🔁"
                label={isNote ? "הפוך למשימה" : "הפוך להערה"}
                onClick={onToggleType}
              />
            ) : null}
            {onSnooze ? (
              <IconAction icon="⏰" label="נודניק" onClick={onSnooze} />
            ) : null}
            {onComplete ? (
              <IconAction
                icon="✅"
                label="בוצע"
                onClick={onComplete}
                className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
              />
            ) : null}
          </div>
        ) : null}
      </article>

      {editing && onEdit ? (
        <ItemEditModal item={item} onClose={() => setEditing(false)} onSave={onEdit} />
      ) : null}
    </>
  );
}
