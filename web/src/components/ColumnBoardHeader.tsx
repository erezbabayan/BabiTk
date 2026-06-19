import type { ReactNode } from "react";
import { BoardBrushMark, type BoardMarkTone } from "./MindTaskerLogo";

/** Fixed width for column search bars — keep all boards aligned. */
export const COLUMN_SEARCH_WIDTH_CLASS = "w-[10rem]";

interface ColumnBoardHeaderProps {
  title: string;
  titleClassName: string;
  borderClassName: string;
  markTone: BoardMarkTone;
  search?: ReactNode;
  aiAction?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

export function ColumnBoardHeader({
  title,
  titleClassName,
  borderClassName,
  markTone,
  search,
  aiAction,
  action,
  children,
}: ColumnBoardHeaderProps) {
  return (
    <header className={`mb-2 border-b pb-2 pt-0.5 ${borderClassName}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
        <div className="flex min-w-0 shrink-0 flex-row-reverse items-center gap-1.5">
          <h2
            className={`min-w-0 whitespace-nowrap text-right font-board text-[1.45rem] font-extrabold leading-tight tracking-wide ${titleClassName}`}
          >
            {title}
          </h2>
          <BoardBrushMark tone={markTone} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {search ? <div className={`${COLUMN_SEARCH_WIDTH_CLASS} shrink-0`}>{search}</div> : null}
          {aiAction ? <div className="shrink-0">{aiAction}</div> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
      {children}
    </header>
  );
}
