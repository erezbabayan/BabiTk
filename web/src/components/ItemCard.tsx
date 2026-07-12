import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import type { MindtaskerItem } from "../types";
import { ItemEditModal, type ItemEditInput } from "./ItemEditModal";
import { SourceIndicator } from "./SourceIndicator";
import { SourceInlinePanel } from "./SourceInlinePanel";
import { resolveItemSource } from "../lib/item-source";
import {
  buildItemDisplayFields,
  buildItemScheduleLine,
  isItemContentCollapsed,
  isTaskListStruck,
  itemCardMinHeight,
} from "../lib/item-display";
import { ITEM_ACTION_ATTR, ITEM_DRAG_HANDLE_ATTR } from "./SwipeableItemCard";
import { ItemTagDots } from "./ItemTagDots";
import { NotebookIcon, type NotebookIconName, type NotebookIconTone } from "./NotebookIcons";
import { type UserTag } from "../lib/tags";
import {
  boardAccentColor,
  boardAccentSide,
  resolveBoardAccent,
  type BoardAccentTone,
} from "../lib/board-accent";
import {
  ITEM_BODY_CLASS,
  ITEM_HEADLINE_CLASS,
} from "../lib/item-typography";
import { isPriorityItem } from "../lib/item-priority";
import { PriorityStar } from "./PriorityStar";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";

export const ITEM_DRAG_MIME = "application/x-mindtasker-item";

interface ItemCardProps {
  item: MindtaskerItem;
  onEdit?: (input: ItemEditInput) => void | Promise<void>;
  onToggleType?: () => void;
  onComplete?: () => void;
  onSnooze?: () => void;
  onTagPress?: () => void;
  tagPickerOpen?: boolean;
  onTogglePriority?: () => void;
  /** Live tag chips while the wheel picker is open for this item. */
  tagsOverride?: string[];
  compact?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  userTags?: UserTag[];
  boardAccent?: BoardAccentTone;
  /** Strikethrough title/body in task lists when done/archived/deleted on the board. */
  taskListDone?: boolean;
  /** Undo archive / delete in task lists (shows ↩ instead of ✓). */
  onTaskListUndo?: () => void;
}

function NotebookActionButton({
  icon,
  label,
  onClick,
  active = false,
  accent = false,
  reminder = false,
}: {
  icon: NotebookIconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  reminder?: boolean;
}) {
  let tone: NotebookIconTone = "neutral";
  if (reminder) tone = "danger";
  else if (accent) tone = "blue";
  else if (active) tone = "slate";

  return (
    <button
      type="button"
      {...{ [ITEM_ACTION_ATTR]: "" }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      aria-pressed={active || reminder}
      style={{ touchAction: "manipulation" }}
      className={`notebook-icon-btn ${active ? "notebook-icon-btn--active" : ""} ${
        reminder ? "notebook-icon-btn--reminder" : ""
      } ${accent ? "notebook-icon-btn--accent" : ""}`}
    >
      <NotebookIcon name={icon} size={15} tone={tone} />
    </button>
  );
}

function TaskCheckbox({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      {...{ [ITEM_ACTION_ATTR]: "" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="notebook-task-check mt-0.5 shrink-0"
      title="סמן כבוצע"
      aria-label="סמן כבוצע"
    >
      <NotebookIcon name="circle" size={18} tone="muted" />
    </button>
  );
}

export function ItemCard({
  item,
  onEdit,
  onToggleType,
  onComplete,
  onSnooze,
  onTagPress,
  tagPickerOpen = false,
  onTogglePriority,
  tagsOverride,
  compact = true,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  userTags = [],
  boardAccent: boardAccentProp,
  taskListDone = false,
  onTaskListUndo,
}: ItemCardProps) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [itemExpanded, setItemExpanded] = useState(false);
  const { view } = useBoardItemViewOptional();
  const isSquares = view === "squares";

  const display = buildItemDisplayFields(item);
  const sourceInfo = resolveItemSource(item);
  const scheduleLine = buildItemScheduleLine(display);
  const contentCollapsed = isItemContentCollapsed(display.isItemExpandable, itemExpanded);
  const headlineText = display.body ? display.headline : display.fullHeadline;
  const hasActions = Boolean(onEdit || onToggleType || onComplete || onSnooze || onTagPress);
  const visibleTags = tagsOverride ?? display.tags;
  const hasTags = visibleTags.length > 0;
  const boardAccent = resolveBoardAccent(item, boardAccentProp);
  const accentSide = boardAccentSide(boardAccent);
  const accentColor = boardAccentColor(boardAccent);
  const doneStrike = taskListDone || isTaskListStruck(item);
  const strikeClass = doneStrike ? "line-through text-slate-400" : "";
  const priority = isPriorityItem(item);

  function toggleSource() {
    if (!sourceInfo.canOpen) return;
    setShowSource((open) => !open);
  }

  useEffect(() => {
    setItemExpanded(false);
  }, [item.id]);

  function handleDoubleClick(event: MouseEvent) {
    if (!onEdit || showSource) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label, [data-item-drag-handle]")) {
      return;
    }
    setEditing(true);
  }

  const cardMinHeight = itemCardMinHeight(display, itemExpanded);

  return (
    <>
      <article
        data-item-drag-root=""
        onDoubleClick={handleDoubleClick}
        style={
          isSquares
            ? { minHeight: "7.5rem", height: "100%" }
            : cardMinHeight !== undefined
              ? { minHeight: cardMinHeight }
              : undefined
        }
        className={`board-notebook-item relative overflow-hidden transition ${
          isSquares ? "board-notebook-item--squares h-full" : ""
        } ${isDragging ? "opacity-40" : ""} ${onEdit ? "cursor-default" : ""}`}
      >
        <div
          className={`absolute inset-y-0 w-[3px] ${
            accentSide === "right" ? "right-0 rounded-r-xl" : "left-0 rounded-l-xl"
          }`}
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />

        <div
          className={`px-2 py-1.5 ${
            accentSide === "right" ? "pr-3" : "pl-3"
          }`}
        >
          <div className="flex items-start gap-2">
            {onComplete ? <TaskCheckbox onClick={onComplete} /> : null}
            <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3
              className={`min-w-0 flex-1 ${ITEM_HEADLINE_CLASS} ${
                contentCollapsed || isSquares ? "line-clamp-2" : ""
              } ${strikeClass}`}
            >
              {headlineText}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {onTogglePriority ? (
                <button
                  type="button"
                  {...{ [ITEM_ACTION_ATTR]: "" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePriority();
                  }}
                  className="notebook-icon-btn mt-0.5 flex h-6 w-6 items-center justify-center"
                  title={priority ? "הסר עדיפות" : "סמן כעדיפות"}
                  aria-label={priority ? "הסר עדיפות" : "סמן כעדיפות"}
                  aria-pressed={priority}
                >
                  <PriorityStar active={priority} size={15} />
                </button>
              ) : priority ? (
                <span
                  className="mt-0.5 flex h-6 w-6 items-center justify-center"
                  title="עדיפות"
                  aria-label="עדיפות"
                >
                  <PriorityStar active size={15} />
                </span>
              ) : null}
              <SourceIndicator
                item={item}
                compact
                iconOnly
                isOpen={showSource}
                onOpen={toggleSource}
              />
              {draggable ? (
                <span
                  {...{ [ITEM_DRAG_HANDLE_ATTR]: "" }}
                  draggable={!showSource}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    onDragStart?.(e);
                  }}
                  onDragEnd={onDragEnd}
                  className="notebook-icon-btn notebook-icon-btn--muted mt-0.5 flex h-5 w-4 cursor-grab select-none items-center justify-center active:cursor-grabbing"
                  title="גרור"
                  aria-label="גרור"
                >
                  <NotebookIcon name="grip" size={14} tone="muted" />
                </span>
              ) : null}
            </div>
          </div>

          {showSource ? (
            <div className="mt-0.5">
              <SourceInlinePanel item={item} onClose={() => setShowSource(false)} />
            </div>
          ) : (
            <>
              {display.body && !isSquares ? (
                <div className="mt-0.5 text-right">
                  <p
                    className={`whitespace-pre-wrap ${ITEM_BODY_CLASS} ${strikeClass} ${
                      contentCollapsed ? "line-clamp-2" : ""
                    }`}
                  >
                    {display.body}
                  </p>
                </div>
              ) : null}

              {display.isItemExpandable && !isSquares ? (
                <button
                  type="button"
                  {...{ [ITEM_ACTION_ATTR]: "" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemExpanded((value) => !value);
                  }}
                  className="mt-0.5 shrink-0 text-[10px] font-medium text-slate-400 hover:text-slate-600"
                  aria-expanded={itemExpanded}
                >
                  {itemExpanded ? "הסתר" : "הרחב"}
                </button>
              ) : null}

              {hasTags && !showSource ? (
                <div className="mt-1">
                  <ItemTagDots tags={visibleTags} userTags={userTags} />
                </div>
              ) : null}

              {!showSource && (hasActions || scheduleLine) ? (
                <div className="mt-1 border-t border-slate-100/80 pt-1">
                  <div className="flex min-h-4 w-full items-center gap-1.5">
                    {scheduleLine ? (
                      <span className="shrink-0 text-[10px] leading-none text-slate-400">
                        {scheduleLine}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1" aria-hidden />
                    {hasActions ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-0.5">
                        {onTagPress ? (
                          <NotebookActionButton
                            icon="tag"
                            label="תיוג"
                            onClick={onTagPress}
                            active={tagPickerOpen}
                          />
                        ) : null}
                        {onEdit ? (
                          <NotebookActionButton icon="edit" label="עריכה" onClick={() => setEditing(true)} />
                        ) : null}
                        {onToggleType ? (
                          <NotebookActionButton
                            icon="swap"
                            label={display.isNote ? "הפוך למשימה" : "הפוך להערה"}
                            onClick={onToggleType}
                          />
                        ) : null}
                        {onSnooze ? (
                          <NotebookActionButton
                            icon="bell"
                            label="תזכורת"
                            onClick={onSnooze}
                            reminder={display.reminderActive}
                          />
                        ) : null}
                        {onTaskListUndo ? (
                          <NotebookActionButton icon="undo" label="שחזר" onClick={onTaskListUndo} active />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
            </div>
          </div>
        </div>
      </article>

      {editing && onEdit ? (
        <ItemEditModal
          key={item.id}
          item={item}
          onClose={() => setEditing(false)}
          onSave={onEdit}
        />
      ) : null}
    </>
  );
}
