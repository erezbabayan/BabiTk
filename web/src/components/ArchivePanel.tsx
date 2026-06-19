import { ItemCard } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import type { ItemEditInput } from "./ItemEditModal";
import type { MindtaskerItem } from "../types";
import { restoreSwipeActions } from "../lib/item-swipe-actions";

interface ArchivePanelProps {
  items: MindtaskerItem[];
  variant: "inbox" | "notes";
  onRestore: (item: MindtaskerItem) => void;
  onDelete: (item: MindtaskerItem) => void;
  onEdit?: (item: MindtaskerItem, patch: ItemEditInput) => void;
}

const EMPTY_MESSAGES: Record<ArchivePanelProps["variant"], string> = {
  inbox:
    "אין פריטים בארכיון. פריטים במחברת שלא נוגעו בהם 48 שעות עוברים לכאן אוטומטית.",
  notes: "אין הערות בארכיון. החלק ימינה למחיקה, שמאלה לשחזור.",
};

export function ArchivePanel({ items, variant, onRestore, onDelete, onEdit }: ArchivePanelProps) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{EMPTY_MESSAGES[variant]}</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const swipe = restoreSwipeActions(
          () => onRestore(item),
          () => onDelete(item),
        );
        return (
          <SwipeableItemCard key={item.id} leftAction={swipe.left} rightAction={swipe.right}>
            <ItemCard
              item={item}
              compact
              onEdit={onEdit ? (patch) => onEdit(item, patch) : undefined}
            />
          </SwipeableItemCard>
        );
      })}
    </div>
  );
}
