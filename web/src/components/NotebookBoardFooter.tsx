import type { NotebookBoardTone } from "./NotebookBoardSection";
import { focusQuickCapture } from "../lib/focus-quick-capture";
import { NotebookIcon } from "./NotebookIcons";

interface NotebookBoardFooterProps {
  tone: NotebookBoardTone;
  label: string;
  onClick?: () => void;
}

const TONE_CLASS: Record<NotebookBoardTone, string> = {
  slate: "text-stone-600 hover:text-stone-800",
  blue: "text-blue-600 hover:text-blue-800",
  orange: "text-orange-600 hover:text-orange-800",
};

/** Notebook column footer — handwritten "+ …" link. */
export function NotebookBoardFooter({ tone, label, onClick }: NotebookBoardFooterProps) {
  return (
    <div className="board-notebook-footer shrink-0" data-no-drag-scroll>
      <button
        type="button"
        onClick={onClick ?? focusQuickCapture}
        className={`board-notebook-footer-btn font-board-tab ${TONE_CLASS[tone]}`}
      >
        <NotebookIcon name="plus" size={14} tone={tone === "blue" ? "blue" : tone === "orange" ? "orange" : "slate"} />
        <span>{label}</span>
      </button>
    </div>
  );
}
