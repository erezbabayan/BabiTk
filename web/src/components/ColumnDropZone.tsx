import type { DragEvent, ReactNode } from "react";
import type { DashboardColumn } from "../lib/item-columns";

const ACTIVE_RING: Record<DashboardColumn, string> = {
  inbox: "ring-2 ring-slate-300 ring-offset-1",
  today: "ring-2 ring-blue-400 ring-offset-1",
  notes: "ring-2 ring-orange-400 ring-offset-1",
};

const ACTIVE_BG: Record<DashboardColumn, string> = {
  inbox: "bg-white",
  today: "bg-blue-50/80",
  notes: "bg-orange-50/80",
};

interface ColumnDropZoneProps {
  column: DashboardColumn;
  active: boolean;
  dragging: boolean;
  onActivate: (column: DashboardColumn) => void;
  onDeactivate: () => void;
  onDrop: (column: DashboardColumn) => void;
  className?: string;
  children: ReactNode;
}

export function ColumnDropZone({
  column,
  active,
  dragging,
  onActivate,
  onDeactivate,
  onDrop,
  className = "",
  children,
}: ColumnDropZoneProps) {
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    onActivate(column);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    onDrop(column);
  }

  return (
    <div
      className={`min-h-0 flex-1 transition ${dragging ? ACTIVE_BG[column] : ""} ${active ? ACTIVE_RING[column] : ""} ${className}`}
      onDragEnter={(e) => {
        e.preventDefault();
        onActivate(column);
      }}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onDeactivate();
        }
      }}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}
