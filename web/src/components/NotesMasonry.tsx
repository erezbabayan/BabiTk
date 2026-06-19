import type { DragEvent } from "react";
import type { MindtaskerItem } from "../types";
import type { UserTag } from "../lib/tags";
import { boardSwipeActions } from "../lib/item-swipe-actions";
import { ItemCard } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import type { ItemEditInput } from "./ItemEditModal";

interface NotesMasonryProps {
  notes: MindtaskerItem[];
  userTags?: UserTag[];
  onEdit?: (item: MindtaskerItem, patch: ItemEditInput) => void;
  onToggleType?: (item: MindtaskerItem) => void;
  onArchive?: (item: MindtaskerItem) => void;
  onDelete?: (item: MindtaskerItem) => void;
  dragProps?: (item: MindtaskerItem) => {
    draggable: true;
    isDragging: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
}

export function NotesMasonry({
  notes,
  userTags = [],
  onEdit,
  onToggleType,
  onArchive,
  onDelete,
  dragProps,
}: NotesMasonryProps) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {notes.map((item) => {
        const swipe =
          onArchive && onDelete
            ? boardSwipeActions(() => onArchive(item), () => onDelete(item))
            : null;

        const card = (
          <ItemCard
            item={item}
            compact
            userTags={userTags}
            {...(dragProps ? dragProps(item) : {})}
            onEdit={onEdit ? (patch) => onEdit(item, patch) : undefined}
            onToggleType={onToggleType ? () => onToggleType(item) : undefined}
          />
        );

        return (
          <div key={item.id}>
            {swipe ? (
              <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right}>
                {card}
              </SwipeableItemCard>
            ) : (
              card
            )}
          </div>
        );
      })}
    </div>
  );
}
