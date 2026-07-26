import { ItemCard } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import type { ItemEditInput } from "./ItemEditModal";
import type { MindtaskerItem } from "../types";
import { restoreSwipeActions } from "../lib/item-swipe-actions";
import { boardItemCellClass, boardItemCellStyle, boardItemsLayoutClass, boardItemsLayoutStyle } from "../lib/board-item-layout";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";

interface CompletedPanelProps {
  items: MindtaskerItem[];
  onRestore: (item: MindtaskerItem) => void;
  onDelete: (item: MindtaskerItem) => void;
  onEdit?: (item: MindtaskerItem, patch: ItemEditInput) => void;
}

export function CompletedPanel({
  items,
  onRestore,
  onDelete,
  onEdit,
}: CompletedPanelProps) {
  const { view } = useBoardItemViewOptional();

  if (items.length === 0) {
    return (
      <p className="text-sm text-blue-500/80">
        אין משימות שהושלמו. סמן את העיגול או החלק לסימון כבוצע.
      </p>
    );
  }

  return (
    <div className={boardItemsLayoutClass(view)} style={boardItemsLayoutStyle(view)}>
      {items.map((item) => {
        const swipe = restoreSwipeActions(
          () => onRestore(item),
          () => onDelete(item),
        );
        return (
          <div key={item.id} className={boardItemCellClass(view)} style={boardItemCellStyle(view)}>
            <SwipeableItemCard
              leftAction={swipe.left}
              rightAction={swipe.right}
              squares={view === "squares"}
            >
              <ItemCard
                item={item}
                boardAccent="today"
                compact
                onEdit={onEdit ? (patch) => onEdit(item, patch) : undefined}
              />
            </SwipeableItemCard>
          </div>
        );
      })}
    </div>
  );
}
