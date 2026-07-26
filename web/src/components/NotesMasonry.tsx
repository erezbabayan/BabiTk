import type { DragEvent } from "react";
import type { MindtaskerItem } from "../types";
import type { UserTag } from "../lib/tags";
import { boardSwipeActions } from "../lib/item-swipe-actions";
import { ItemCard } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import type { ItemEditInput } from "./ItemEditModal";
import { boardItemCellClass, boardItemCellStyle, boardItemsLayoutClass, boardItemsLayoutStyle } from "../lib/board-item-layout";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";

interface NotesMasonryProps {
  notes: MindtaskerItem[];
  userTags?: UserTag[];
  onEdit?: (item: MindtaskerItem, patch: ItemEditInput) => void;
  onToggleType?: (item: MindtaskerItem) => void;
  onArchive?: (item: MindtaskerItem) => void;
  onDelete?: (item: MindtaskerItem) => void;
  onTagPress?: (item: MindtaskerItem) => void;
  tagPickerOpenId?: string | null;
  tagDraftForItem?: (item: MindtaskerItem) => string[] | undefined;
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
  onTagPress,
  tagPickerOpenId = null,
  tagDraftForItem,
  dragProps,
}: NotesMasonryProps) {
  const { view } = useBoardItemViewOptional();

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className={boardItemsLayoutClass(view)} style={boardItemsLayoutStyle(view)}>
      {notes.map((item) => {
        const swipe =
          onArchive && onDelete
            ? boardSwipeActions(() => onArchive(item), () => onDelete(item), "notes")
            : null;

        const card = (
          <ItemCard
            item={item}
            boardAccent="notes"
            compact
            userTags={userTags}
            {...(dragProps ? dragProps(item) : {})}
            onEdit={onEdit ? (patch) => onEdit(item, patch) : undefined}
            onToggleType={onToggleType ? () => onToggleType(item) : undefined}
            onTagPress={onTagPress ? () => onTagPress(item) : undefined}
            tagPickerOpen={tagPickerOpenId === item.id}
            tagsOverride={tagDraftForItem?.(item)}
          />
        );

        return (
          <div key={item.id} className={boardItemCellClass(view)} style={boardItemCellStyle(view)}>
            {swipe ? (
              <SwipeableItemCard
                leftAction={swipe.left}
                rightAction={swipe.right}
                squares={view === "squares"}
              >
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
