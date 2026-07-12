import { ItemCard } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import type { ItemEditInput } from "./ItemEditModal";
import type { MindtaskerItem } from "../types";
import { restoreSwipeActions } from "../lib/item-swipe-actions";
import { boardItemsLayoutClass } from "../lib/board-item-layout";
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
        אין משימות שהושלמו. לחץ ✅ או החלק ימינה לסימון כבוצע.
      </p>
    );
  }

  return (
    <div className={boardItemsLayoutClass(view)}>
      {items.map((item) => {
        const swipe = restoreSwipeActions(
          () => onRestore(item),
          () => onDelete(item),
        );
        return (
          <SwipeableItemCard key={item.id} leftAction={swipe.left} rightAction={swipe.right}>
            <ItemCard
              item={item}
              boardAccent="today"
              compact
              onEdit={onEdit ? (patch) => onEdit(item, patch) : undefined}
            />
          </SwipeableItemCard>
        );
      })}
    </div>
  );
}
