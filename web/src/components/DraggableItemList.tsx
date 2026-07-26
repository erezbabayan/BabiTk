import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { DashboardColumn } from "../lib/item-columns";
import {
  BOARD_ITEM_SQUARE_EMPTY_CLASS,
  BOARD_SQUARE_FILL_STYLE,
  boardItemCellClass,
  boardItemCellStyle,
  boardItemsLayoutClass,
  boardItemsLayoutStyle,
} from "../lib/board-item-layout";
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

const LIST_ROW_ESTIMATE_PX = 76;
const VIRTUALIZE_MIN_ITEMS = 24;

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

function useBoardScrollParent(containerRef: RefObject<HTMLElement | null>) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = containerRef.current?.closest("[data-board-scroll]");
    setScrollElement(element instanceof HTMLElement ? element : null);
  }, [containerRef]);

  return scrollElement;
}

export function DraggableItemList({
  column,
  items,
  draggingId,
  dropSlot,
  disabled = false,
  className = "",
  emptyMessage,
  onDropSlotChange,
  onDrop,
  renderItem,
}: DraggableItemListProps) {
  const { view } = useBoardItemViewOptional();
  const itemsLayoutClass = boardItemsLayoutClass(view);
  const itemsLayoutStyle = boardItemsLayoutStyle(view);
  const cellClass = boardItemCellClass(view);
  const cellStyle = boardItemCellStyle(view);
  const isSquares = view === "squares";
  const active = draggingId !== null && dropSlot?.column === column;

  const listRootRef = useRef<HTMLDivElement>(null);
  const scrollElement = useBoardScrollParent(listRootRef);
  const shouldVirtualize =
    !disabled &&
    !isSquares &&
    draggingId === null &&
    items.length >= VIRTUALIZE_MIN_ITEMS &&
    scrollElement !== null;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => LIST_ROW_ESTIMATE_PX,
    overscan: 8,
  });

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

  function renderItemCell(item: { id: string }, index: number) {
    const rendered = renderItem(item.id);
    if (rendered == null) return null;

    return (
      <div key={item.id} className={cellClass} style={cellStyle} data-index={index}>
        {!isSquares && dropSlot?.column === column && dropSlot.beforeId === item.id ? (
          <DropIndicator column={column} />
        ) : null}
        <div
          style={isSquares ? BOARD_SQUARE_FILL_STYLE : undefined}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, item.id)}
        >
          {rendered}
        </div>
      </div>
    );
  }

  const itemNodes = shouldVirtualize
    ? virtualizer.getVirtualItems().map((virtualRow) => {
        const item = items[virtualRow.index];
        if (!item) return null;
        return (
          <div
            key={item.id}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderItemCell(item, virtualRow.index)}
          </div>
        );
      })
    : items.flatMap((item, index) => {
        const cell = renderItemCell(item, index);
        return cell ? [cell] : [];
      });

  if (disabled || isSquares) {
    return (
      <div
        className={`${itemsLayoutClass} ${className}`.trim()}
        style={itemsLayoutStyle}
        onDragOver={(e) => handleDragOver(e, null)}
        onDrop={(e) =>
          handleDrop(e, dropSlot?.column === column ? dropSlot.beforeId : null)
        }
      >
        {items.length === 0 ? (
          <div className={isSquares ? BOARD_ITEM_SQUARE_EMPTY_CLASS : undefined}>
            {emptyMessage}
          </div>
        ) : (
          itemNodes
        )}
      </div>
    );
  }

  return (
    <div
      ref={listRootRef}
      className={`flex flex-col transition ${active ? ACTIVE_RING[column] : ""} ${className}`}
      onDragOver={(e) => handleDragOver(e, null)}
      onDrop={(e) =>
        handleDrop(e, dropSlot?.column === column ? dropSlot.beforeId : null)
      }
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
        <div className={itemsLayoutClass} style={itemsLayoutStyle}>
          {shouldVirtualize ? (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {itemNodes}
            </div>
          ) : (
            itemNodes
          )}
          {dropSlot?.column === column &&
          dropSlot.beforeId === null &&
          items.length > 0 ? (
            <DropIndicator column={column} />
          ) : null}
        </div>
      )}
      <div
        className="min-h-8"
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
