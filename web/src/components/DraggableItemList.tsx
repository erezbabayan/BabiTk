import type { DragEvent, ReactNode } from "react";
import type { DashboardColumn } from "../lib/item-columns";
import { boardItemsLayoutClass } from "../lib/board-item-layout";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";

const ACTIVE_RING: Record<DashboardColumn, string> = {
  inbox: "ring-2 ring-slate-400 ring-offset-1",
  today: "ring-2 ring-blue-400 ring-offset-1",
  notes: "ring-2 ring-orange-400 ring-offset-1",
};

const DROP_LINE: Record<DashboardColumn, string> = {
  inbox: "bg-slate-400",
  today: "bg-blue-400",
  notes: "bg-orange-400",
};

export interface DropSlot {
  column: DashboardColumn;
  beforeId: string | null;
}

interface DraggableItemListProps {
  column: DashboardColumn;
  items: { id: string }[];
  draggingId: string | null;
  dropSlot: DropSlot | null;
  disabled?: boolean;
  className?: string;
  emptyMessage: ReactNode;
  onDragStart: (itemId: string, e: DragEvent) => void;
  onDragEnd: () => void;
  onDropSlotChange: (slot: DropSlot) => void;
  onDrop: (slot: DropSlot) => void;
  renderItem: (itemId: string) => ReactNode;
}

function DropIndicator({ column }: { column: DashboardColumn }) {
  return <div className={`my-0.5 h-0.5 rounded ${DROP_LINE[column]}`} />;
}

export function DraggableItemList({
  column,
  items,
  draggingId,
  dropSlot,
  disabled = false,
  className = "",
  emptyMessage,
  onDragStart,
  onDragEnd,
  onDropSlotChange,
  onDrop,
  renderItem,
}: DraggableItemListProps) {
  const { view } = useBoardItemViewOptional();
  const itemsLayoutClass = boardItemsLayoutClass(view);
  const active = draggingId !== null && dropSlot?.column === column;

  function handleDragOver(e: DragEvent, beforeId: string | null) {
    if (disabled || !draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    onDropSlotChange({ column, beforeId });
  }

  function handleDrop(e: DragEvent, beforeId: string | null) {
    if (disabled || !draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    onDrop({ column, beforeId });
  }

  if (disabled) {
    return (
      <div className={`${itemsLayoutClass} ${className}`}>
        {items.map((item) => (
          <div key={item.id} className={view === "squares" ? "min-w-0" : undefined}>
            {renderItem(item.id)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col transition ${active ? ACTIVE_RING[column] : ""} ${className}`}
      onDragOver={(e) => handleDragOver(e, null)}
      onDrop={(e) => handleDrop(e, dropSlot?.column === column ? dropSlot.beforeId : null)}
    >
      {items.length === 0 ? (
        <div
          className="min-h-16"
          onDragOver={(e) => handleDragOver(e, null)}
          onDrop={(e) => handleDrop(e, null)}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className={itemsLayoutClass}>
          {items.map((item) => (
            <div key={item.id} className={view === "squares" ? "min-w-0" : undefined}>
              {view === "list" &&
              dropSlot?.column === column &&
              dropSlot.beforeId === item.id ? (
                <DropIndicator column={column} />
              ) : null}
              <div
                className={view === "squares" ? "h-full min-h-0" : undefined}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDrop={(e) => handleDrop(e, item.id)}
              >
                {renderItem(item.id)}
              </div>
            </div>
          ))}
          {view === "list" &&
          dropSlot?.column === column &&
          dropSlot.beforeId === null &&
          items.length > 0 ? (
            <DropIndicator column={column} />
          ) : null}
        </div>
      )}
      <div
        className="min-h-16"
        onDragOver={(e) => handleDragOver(e, null)}
        onDrop={(e) => handleDrop(e, null)}
      />
    </div>
  );
}

export function startItemDrag(itemId: string, e: DragEvent) {
  e.dataTransfer.setData("application/x-mindtasker-item", itemId);
  e.dataTransfer.setData("text/plain", itemId);
  e.dataTransfer.effectAllowed = "move";
}
