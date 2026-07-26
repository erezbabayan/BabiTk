import type { ReactNode } from "react";

import { BOARD_SECTION_CLASS } from "./MouseDragScroll";
import { NotebookBoardFooter } from "./NotebookBoardFooter";

export type NotebookBoardTone = "slate" | "blue" | "orange";

interface NotebookBoardFooterConfig {
  label: string;
  onClick?: () => void;
}

interface NotebookBoardSectionProps {
  tone: NotebookBoardTone;
  tabTitle: string;
  active?: boolean;
  className?: string;
  footer?: NotebookBoardFooterConfig;
  children: ReactNode;
}

/** Paper panel wrapper for dashboard columns (title lives inside ColumnBoardHeader). */
export function NotebookBoardSection({
  tone,
  tabTitle,
  active = true,
  className = "",
  footer,
  children,
}: NotebookBoardSectionProps) {
  if (!active) return null;

  return (
    <div className={`board-notebook board-notebook--${tone} ${className}`}>
      <section
        aria-label={tabTitle}
        className={`board-notebook-panel ${BOARD_SECTION_CLASS}`}
      >
        {children}
        {footer ? (
          <NotebookBoardFooter tone={tone} label={footer.label} onClick={footer.onClick} />
        ) : null}
      </section>
    </div>
  );
}
