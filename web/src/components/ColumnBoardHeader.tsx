import type { ReactNode, WheelEvent } from "react";
import { BoardBrushMark, type BoardMarkTone } from "./MindTaskerLogo";

function blockHeaderWheel(event: WheelEvent) {
  event.stopPropagation();
}
/** Title row height — shared across boards for subgrid alignment. */
export const BOARD_HEADER_TITLE_ROW_CLASS =
  "board-notebook-chrome flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1";

/** Action buttons — packed to the inline end (left in RTL); DOM: sort → archive → lists. */
export const BOARD_HEADER_TOOLBAR_ROW_CLASS =
  "board-notebook-chrome board-notebook-toolbar mt-1 flex min-h-6 shrink-0 flex-nowrap items-center justify-end gap-x-1.5 overflow-x-auto overflow-y-visible lg:mt-1";

/** Search sits on its own row so the field can use the full column width. */
export const BOARD_HEADER_SEARCH_ROW_CLASS =
  "board-notebook-chrome mt-1.5 mb-2 min-w-0 w-full";

interface ColumnBoardHeaderProps {
  title: string;
  titleClassName: string;
  markTone: BoardMarkTone;
  /** Kept for call-site compatibility — title always shows inside the panel. */
  notebookLayout?: boolean;
  /** Visual left in RTL — far side of the title row. */
  titleTrailing?: ReactNode;
  /** Sits next to the title (right in RTL), opposite the trailing controls. */
  titleExtra?: ReactNode;
  dateSort?: ReactNode;
  search?: ReactNode;
  toolbarExtra?: ReactNode;
  action?: ReactNode;
  /** Visual left of the toolbar row in RTL (last in DOM with justify-end). */
  toolbarLeading?: ReactNode;
}

export function ColumnBoardHeader({
  title,
  titleClassName,
  markTone,
  titleTrailing,
  titleExtra,
  dateSort,
  search,
  toolbarExtra,
  action,
  toolbarLeading,
}: ColumnBoardHeaderProps) {
  const hasActions = Boolean(dateSort || toolbarExtra || action || toolbarLeading);

  return (
    <header data-no-drag-scroll className="overflow-visible pt-0.5">
      <div
        className={`${BOARD_HEADER_TITLE_ROW_CLASS} overflow-visible`}
        data-no-drag-scroll
        onWheel={blockHeaderWheel}
      >
        <div className="flex min-w-min flex-1 items-center justify-start gap-2 overflow-visible">
          {/* First in RTL → sits to the right of the title */}
          <BoardBrushMark tone={markTone} />
          <h2
            className={`board-title-hand whitespace-nowrap text-end text-[1.25rem] leading-snug text-slate-900 sm:text-[1.4rem] ${titleClassName}`}
          >
            {title}
          </h2>
          {titleExtra ? (
            <div className="relative z-[4] shrink-0" data-babitk-header-slot="title">
              {titleExtra}
            </div>
          ) : null}
        </div>
        {titleTrailing ? (
          <div
            className="relative z-[4] max-w-full shrink-0"
            data-babitk-header-slot="start"
          >
            {titleTrailing}
          </div>
        ) : null}
      </div>
      {hasActions ? (
        <div
          data-no-drag-scroll
          onWheel={blockHeaderWheel}
          className={`${BOARD_HEADER_TOOLBAR_ROW_CLASS} relative z-[3]`}
        >
          {dateSort ? <div className="shrink-0">{dateSort}</div> : null}
          {toolbarExtra ? <div className="shrink-0">{toolbarExtra}</div> : null}
          {action ? (
            <div className="flex shrink-0 items-center gap-1">{action}</div>
          ) : null}
          {toolbarLeading ? (
            <div
              className="relative z-[4] shrink-0"
              data-babitk-header-slot="toolbar-start"
            >
              {toolbarLeading}
            </div>
          ) : null}
        </div>
      ) : null}
      {search ? (
        <div
          data-no-drag-scroll
          data-babitk-header-slot="search"
          onWheel={blockHeaderWheel}
          className={BOARD_HEADER_SEARCH_ROW_CLASS}
        >
          {search}
        </div>
      ) : null}
    </header>
  );
}
