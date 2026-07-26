import { boardToolbarButtonClass, type BoardToolbarTone } from "../lib/board-toolbar";
import { nextDateSortDirection, type BoardDateSortDirection } from "../lib/board-date-sort";
import { NotebookIcon } from "./NotebookIcons";

interface BoardDateSortButtonProps {
  direction: BoardDateSortDirection;
  onDirectionChange: (direction: BoardDateSortDirection) => void;
  tone?: BoardToolbarTone;
}

const activeToneClasses: Record<BoardToolbarTone, string> = {
  slate: "bg-slate-100 font-semibold",
  blue: "bg-blue-100/80 font-semibold",
  orange: "bg-orange-100/80 font-semibold",
};

function sortTitle(direction: BoardDateSortDirection): string {
  if (direction === "asc") return "מיון לפי תאריך: ישן → חדש";
  if (direction === "desc") return "מיון לפי תאריך: חדש → ישן";
  return "מיון לפי תאריך";
}

export function BoardDateSortButton({
  direction,
  onDirectionChange,
  tone = "slate",
}: BoardDateSortButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onDirectionChange(nextDateSortDirection(direction))}
      title={sortTitle(direction)}
      aria-pressed={direction !== null}
      aria-label={sortTitle(direction)}
      className={`inline-flex h-6 items-center gap-1 ${boardToolbarButtonClass(tone)} ${
        direction ? activeToneClasses[tone] : ""
      }`}
    >
      <NotebookIcon name="sort" size={12} tone={tone === "blue" ? "blue" : tone === "orange" ? "orange" : "slate"} />
      <span>לפי תאריך</span>
    </button>
  );
}
