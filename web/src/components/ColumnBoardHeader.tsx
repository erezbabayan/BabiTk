import type { ReactNode, WheelEvent } from "react";
import { BoardBrushMark, type BoardMarkTone } from "./MindTaskerLogo";

function blockHeaderWheel(event: WheelEvent) {
  event.stopPropagation();
}
/** Search bar — preferred 13rem, shrinks when the row is tight instead of clipping. */
export const COLUMN_SEARCH_WIDTH_CLASS = "w-[13rem] min-w-[5.5rem] max-w-full shrink";

/** Title row height — shared across boards for subgrid alignment. */
export const BOARD_HEADER_TITLE_ROW_CLASS =
  "board-notebook-chrome flex min-h-9 shrink-0 items-center justify-start gap-1";

/** Toolbar row — packed to the inline end (left in RTL); DOM: search → archive. */
export const BOARD_HEADER_TOOLBAR_ROW_CLASS =
  "board-notebook-chrome board-notebook-toolbar mt-1 flex min-h-6 shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1.5 overflow-visible lg:mt-1";

interface ColumnBoardHeaderProps {
  title: string;
  titleClassName: string;
  markTone: BoardMarkTone;
  /** Kept for call-site compatibility — title always shows inside the panel. */
  notebookLayout?: boolean;
  titleTrailing?: ReactNode;
  dateSort?: ReactNode;
  search?: ReactNode;
  toolbarExtra?: ReactNode;
  action?: ReactNode;
}

export function ColumnBoardHeader({
  title,
  titleClassName,
  markTone,
  titleTrailing,
  dateSort,
  search,
  toolbarExtra,
  action,
}: ColumnBoardHeaderProps) {
  const hasToolbar = Boolean(search || dateSort || toolbarExtra || action);

  return (
    <header data-no-drag-scroll className="pt-0.5">
      <div
        className={BOARD_HEADER_TITLE_ROW_CLASS}
        data-no-drag-scroll
        onWheel={blockHeaderWheel}
      >
        <div className="inline-flex max-w-full items-center gap-2">
          {/* First in RTL → sits to the right of the title */}
          <BoardBrushMark tone={markTone} />
          <h2
            className={`board-title-hand min-w-0 truncate whitespace-nowrap text-end text-[1.25rem] leading-snug text-slate-900 sm:text-[1.4rem] ${titleClassName}`}
          >
            {title}
          </h2>
        </div>
        {titleTrailing ? <div className="ms-auto shrink-0">{titleTrailing}</div> : null}
      </div>
      {hasToolbar ? (
        <div
          data-no-drag-scroll
          onWheel={blockHeaderWheel}
          className={`${BOARD_HEADER_TOOLBAR_ROW_CLASS} relative z-[3]`}
        >
          {search ? <div className={COLUMN_SEARCH_WIDTH_CLASS}>{search}</div> : null}
          {dateSort ? <div className="shrink-0">{dateSort}</div> : null}
          {toolbarExtra ? <div className="shrink-0">{toolbarExtra}</div> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
