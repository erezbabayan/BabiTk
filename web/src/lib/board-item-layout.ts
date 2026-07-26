import type { CSSProperties } from "react";

/** Item lists fill the scroll content box (beside the scrollbar gutter). */
export const BOARD_ITEMS_INNER_CLASS = "box-border flex w-full flex-col";

/**
 * In RTL the scrollbar sits on the inline-end edge (physical left).
 * Bleed cancels section padding on that side only; `scrollbar-gutter: stable` reserves the lane.
 */
export const BOARD_SCROLL_SCROLLBAR_EDGE_CLASS = "-me-2 w-[calc(100%+0.5rem)]";

/** Gap between stacked item cards in board columns. */
export const BOARD_ITEM_LIST_GAP_CLASS = "space-y-px";

/** Subtle gutter between square tiles (keep in sync with CSS / mobile). */
export const BOARD_SQUARE_GAP_PX = 6;
export const BOARD_SQUARE_RADIUS_PX = 10;

export const BOARD_ITEM_SQUARES_CLASS = "board-items-squares";
export const BOARD_ITEM_SQUARE_CELL_CLASS = "board-item-square-cell";
export const BOARD_ITEM_SQUARE_EMPTY_CLASS = "board-items-squares-empty";

/**
 * Layout driven by CSS class `.board-items-squares` (single source of truth).
 * Inline style only adds non-class essentials for SSR/HMR safety.
 */
export const BOARD_SQUARE_GRID_STYLE: CSSProperties = {
  // Prefer CSS class; these mirror it if class failed to load.
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: BOARD_SQUARE_GAP_PX,
  padding: BOARD_SQUARE_GAP_PX,
  width: "100%",
  height: "fit-content",
  alignItems: "stretch",
  alignContent: "start",
  alignSelf: "flex-start",
  flex: "0 0 auto",
};

export const BOARD_SQUARE_CELL_STYLE: CSSProperties = {
  boxSizing: "border-box",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: BOARD_SQUARE_RADIUS_PX,
  backgroundColor: "#ffffff",
};

export const BOARD_SQUARE_FILL_STYLE: CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  width: "100%",
  minHeight: 0,
  overflow: "hidden",
  borderRadius: BOARD_SQUARE_RADIUS_PX,
  backgroundColor: "#ffffff",
};

export type BoardColumnTone = "inbox" | "today" | "notes";

export function boardItemsLayoutClass(view: "list" | "squares"): string {
  return view === "squares" ? BOARD_ITEM_SQUARES_CLASS : BOARD_ITEM_LIST_GAP_CLASS;
}

export function boardItemCellClass(view: "list" | "squares"): string | undefined {
  return view === "squares" ? BOARD_ITEM_SQUARE_CELL_CLASS : undefined;
}

export function boardItemsLayoutStyle(
  view: "list" | "squares",
): CSSProperties | undefined {
  return view === "squares" ? BOARD_SQUARE_GRID_STYLE : undefined;
}

export function boardItemCellStyle(
  view: "list" | "squares",
): CSSProperties | undefined {
  return view === "squares" ? BOARD_SQUARE_CELL_STYLE : undefined;
}

/** Subtle top edge + wash before the scrollable item list (tone-matched per board). */
export function boardItemsZoneClass(column: BoardColumnTone): string {
  const toneClass: Record<BoardColumnTone, string> = {
    inbox: "border-slate-200/90 from-slate-50/80",
    today: "border-blue-200/80 from-blue-50/55",
    notes: "border-orange-200/80 from-orange-50/55",
  };
  return [
    "board-items-zone board-notebook-chrome min-h-0 flex-1 border-t pt-1 mt-0",
    "bg-gradient-to-b to-transparent",
    "lg:pt-1 lg:mt-0",
    toneClass[column],
  ].join(" ");
}
