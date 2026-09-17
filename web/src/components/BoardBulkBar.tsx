import {
  bulkActionCounts,
  sendToBoardBulkLabel,
  type BoardBulkAction,
  type BoardBulkItem,
} from "../lib/board-bulk-actions";
import {
  boardToolbarButtonClass,
  type BoardToolbarTone,
} from "../lib/board-toolbar";

interface BoardBulkBarProps {
  items: BoardBulkItem[];
  total: number;
  busy?: boolean;
  tone: BoardToolbarTone;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onAction: (action: BoardBulkAction) => void;
}

function ActionButton({
  label,
  count,
  onClick,
  disabled,
  className,
}: {
  label: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
  className: string;
}) {
  if (count <= 0) return null;
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      {label} ({count})
    </button>
  );
}

export function BoardBulkBar({
  items,
  total,
  busy = false,
  tone,
  onSelectAll,
  onClear,
  onExit,
  onAction,
}: BoardBulkBarProps) {
  const counts = bulkActionCounts(items);
  const allSelected = total > 0 && items.length === total;
  const base = boardToolbarButtonClass(tone);

  return (
    <div
      className="board-notebook-chrome flex shrink-0 flex-wrap items-center justify-end gap-1 px-0.5 py-1"
      data-no-drag-scroll
    >
      <span className="text-[10px] font-semibold text-slate-600">
        {items.length > 0 ? `${items.length} נבחרו` : "בחירה"}
      </span>
      <button
        type="button"
        disabled={busy || total === 0}
        onClick={allSelected ? onClear : onSelectAll}
        className={base}
      >
        {allSelected ? "בטל בחירה" : "בחר הכל"}
      </button>
      <ActionButton
        label="בוצע"
        count={counts.complete}
        disabled={busy}
        onClick={() => onAction("complete")}
        className={`${base} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}
      />
      <ActionButton
        label="ארכיון"
        count={counts.archive}
        disabled={busy}
        onClick={() => onAction("archive")}
        className={base}
      />
      <ActionButton
        label="שחזר"
        count={counts.restore}
        disabled={busy}
        onClick={() => onAction("restore")}
        className={`${base} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}
      />
      <ActionButton
        label="הפוך להערה"
        count={counts.convertToNote}
        disabled={busy}
        onClick={() => onAction("convertToNote")}
        className={`${base} border-orange-300 text-orange-800 hover:bg-orange-50`}
      />
      <ActionButton
        label="הפוך למשימה"
        count={counts.convertToTask}
        disabled={busy}
        onClick={() => onAction("convertToTask")}
        className={`${base} border-blue-300 text-blue-800 hover:bg-blue-50`}
      />
      <ActionButton
        label={sendToBoardBulkLabel(items)}
        count={counts.sendToBoard}
        disabled={busy}
        onClick={() => onAction("sendToBoard")}
        className={`${base} border-blue-300 text-blue-800 hover:bg-blue-50`}
      />
      <ActionButton
        label="מחק"
        count={counts.delete}
        disabled={busy}
        onClick={() => onAction("delete")}
        className={`${base} border-red-300 text-red-700 hover:bg-red-50`}
      />
      <button type="button" disabled={busy} onClick={onExit} className={base}>
        סיום
      </button>
    </div>
  );
}
