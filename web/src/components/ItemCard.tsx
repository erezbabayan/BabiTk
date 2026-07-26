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
  /** Tighter card for nested list rows (task lists modal). */
  dense?: boolean;
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
  dense = false,
}: {
  icon: NotebookIconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  reminder?: boolean;
  dense?: boolean;
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
      className={`${dense ? "notebook-icon-btn notebook-icon-btn--dense" : "notebook-icon-btn"} ${
        active ? "notebook-icon-btn--active" : ""
      } ${reminder ? "notebook-icon-btn--reminder" : ""} ${accent ? "notebook-icon-btn--accent" : ""}`}
    >
      <NotebookIcon name={icon} size={dense ? 13 : 15} tone={tone} />
    </button>
  );
}

function TaskCheckbox({ onClick, dense = false }: { onClick: () => void; dense?: boolean }) {
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
      className="notebook-task-check shrink-0"
      title="סמן כבוצע"
      aria-label="סמן כבוצע"
    >
      <NotebookIcon name="circle" size={dense ? 14 : 18} tone="muted" />
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
  dense = false,
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
  const isSquares = !dense && view === "squares";

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
  const showBody = Boolean(display.body) && !isSquares && (!dense || itemExpanded);

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

  const cardMinHeight = dense ? undefined : itemCardMinHeight(display, itemExpanded);
  const cardStyle = dense
    ? undefined
    : isSquares
      ? {
          flex: "1 1 auto",
          width: "100%",
          margin: 0,
          borderRadius: 10,
          boxShadow: "none",
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }
      : cardMinHeight !== undefined
        ? { minHeight: cardMinHeight }
        : undefined;

  return (
    <>
      <article
        data-item-drag-root=""
        onDoubleClick={handleDoubleClick}
        style={cardStyle}
        className={`board-notebook-item relative overflow-hidden transition ${
          dense ? "board-notebook-item--dense" : ""
        } ${isSquares ? "board-notebook-item--squares" : ""} ${
          isDragging ? "opacity-40" : ""
        } ${onEdit ? "cursor-default" : ""}`}
      >
        <div
          className={`absolute inset-y-0 w-[3px] ${
            accentSide === "right" ? "right-0 rounded-r-xl" : "left-0 rounded-l-xl"
          }`}
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />

        <div
          className={`${
            isSquares
              ? "box-border flex min-h-0 w-full flex-1 flex-col px-1.5 pb-0.5 pt-0.5"
              : dense
                ? "px-1.5 py-0.5"
                : "px-2 py-1.5"
          } ${accentSide === "right" ? "pr-3" : "pl-3"}`}
        >
          <div
            className={`flex ${dense ? "items-center gap-1" : "items-start gap-2"} ${
              isSquares ? "min-h-0 shrink" : ""
            }`}
          >
            {onComplete ? <TaskCheckbox onClick={onComplete} dense={dense || isSquares} /> : null}
            <div
              className={`min-w-0 flex-1 ${dense ? "flex flex-col gap-0" : ""} ${
                isSquares ? "flex min-h-0 flex-1 flex-col" : ""
              }`}
            >
          <div className={`flex justify-between gap-1 ${dense ? "items-center" : "items-start"}`}>
            <h3
              className={`min-w-0 flex-1 ${
                dense
                  ? "truncate text-right text-xs font-semibold leading-none text-slate-900"
                  : ITEM_HEADLINE_CLASS
              } ${!dense && (contentCollapsed || isSquares) ? "line-clamp-2" : ""} ${strikeClass}`}
            >
              {headlineText}
            </h3>
            <div className="flex shrink-0 items-center gap-0.5">
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
                  className={`notebook-icon-btn flex items-center justify-center ${
                    dense || isSquares ? "notebook-icon-btn--dense" : "mt-0.5 h-6 w-6"
                  }`}
                  title={priority ? "הסר עדיפות" : "סמן כעדיפות"}
                  aria-label={priority ? "הסר עדיפות" : "סמן כעדיפות"}
                  aria-pressed={priority}
                >
                  <PriorityStar active={priority} size={dense || isSquares ? 12 : 15} />
                </button>
              ) : priority ? (
                <span
                  className={`flex items-center justify-center ${dense || isSquares ? "h-4 w-4" : "mt-0.5 h-6 w-6"}`}
                  title="עדיפות"
                  aria-label="עדיפות"
                >
                  <PriorityStar active size={dense || isSquares ? 12 : 15} />
                </span>
              ) : null}
              <span className={dense ? "inline-flex scale-90" : undefined}>
                <SourceIndicator
                  item={item}
                  compact
                  iconOnly
                  isOpen={showSource}
                  onOpen={toggleSource}
                />
              </span>
              {draggable ? (
                <span
                  {...{ [ITEM_DRAG_HANDLE_ATTR]: "" }}
                  draggable={!showSource}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    onDragStart?.(e);
                  }}
                  onDragEnd={onDragEnd}
                  className="notebook-icon-btn notebook-icon-btn--muted mt-0.5 hidden h-5 w-4 cursor-grab select-none items-center justify-center active:cursor-grabbing lg:flex"
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
              {showBody ? (
                <div className="mt-0.5 text-right">
                  <p
                    className={`whitespace-pre-wrap ${
                      dense ? "text-[11px] font-normal leading-snug text-slate-600" : ITEM_BODY_CLASS
                    } ${strikeClass} ${contentCollapsed || dense ? "line-clamp-2" : ""}`}
                  >
                    {display.body}
                  </p>
                </div>
              ) : null}

              {display.isItemExpandable && !isSquares && !dense ? (
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

              {!showSource && hasTags && !isSquares ? (
                <div className={dense ? "mt-0.5" : "mt-1"}>
                  <ItemTagDots tags={visibleTags} userTags={userTags} dense={dense} />
                </div>
              ) : null}

              {!showSource && isSquares && (hasTags || scheduleLine) ? (
                <div className="mt-0.5 flex min-h-0 min-w-0 flex-col gap-0 overflow-hidden">
                  {hasTags ? (
                    <ItemTagDots tags={visibleTags} userTags={userTags} singleLine />
                  ) : null}
                  {scheduleLine ? (
                    <span className="truncate text-[9px] leading-none text-slate-400">
                      {scheduleLine}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {!showSource && (hasActions || (!isSquares && scheduleLine)) ? (
                <div
                  className={`w-full overflow-hidden ${
                    isSquares
                      ? "mt-auto flex shrink-0 flex-col pb-0 pt-0.5"
                      : scheduleLine
                        ? "mt-1 flex flex-col gap-1 border-t border-slate-100/80 pt-1"
                        : `flex items-center gap-1 ${
                            dense
                              ? "mt-0 min-h-0 leading-none"
                              : "mt-1 min-h-0 border-t border-slate-100/80 pt-1"
                          }`
                  }`}
                >
                  {!isSquares && scheduleLine ? (
                    <span
                      className={`min-w-0 truncate leading-none text-slate-400 ${
                        dense ? "text-[9px]" : "text-[10px]"
                      }`}
                    >
                      {scheduleLine}
                    </span>
                  ) : null}
                  {hasActions ? (
                    <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-0">
                      {onTagPress ? (
                        <NotebookActionButton
                          icon="tag"
                          label="תיוג"
                          onClick={onTagPress}
                          active={tagPickerOpen}
                          dense={dense || isSquares}
                        />
                      ) : null}
                      {onEdit ? (
                        <NotebookActionButton
                          icon="edit"
                          label="עריכה"
                          onClick={() => setEditing(true)}
                          dense={dense || isSquares}
                        />
                      ) : null}
                      {onToggleType ? (
                        <NotebookActionButton
                          icon="swap"
                          label={display.isNote ? "הפוך למשימה" : "הפוך להערה"}
                          onClick={onToggleType}
                          dense={dense || isSquares}
                        />
                      ) : null}
                      {onSnooze ? (
                        <NotebookActionButton
                          icon="bell"
                          label="תזכורת"
                          onClick={onSnooze}
                          reminder={display.reminderActive}
                          dense={dense || isSquares}
                        />
                      ) : null}
                      {onTaskListUndo ? (
                        <NotebookActionButton
                          icon="undo"
                          label="שחזר"
                          onClick={onTaskListUndo}
                          active
                          dense={dense || isSquares}
                        />
                      ) : null}
                    </div>
                  ) : null}
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
