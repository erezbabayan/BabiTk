/** Item lists fill the scroll content box (beside the scrollbar gutter). */
export const BOARD_ITEMS_INNER_CLASS = "box-border flex w-full flex-col";

/**
 * In RTL the scrollbar sits on the inline-end edge (physical left).
 * Bleed cancels section padding on that side only; `scrollbar-gutter: stable` reserves the lane.
 */
export const BOARD_SCROLL_SCROLLBAR_EDGE_CLASS = "-me-2 w-[calc(100%+0.5rem)]";

/** Horizontal inset for board header/filter rows (matches the card side opposite the scrollbar). */
export const BOARD_HEADER_PAD_CLASS = "px-2";

/** Gap between stacked item cards in board columns. */
export const BOARD_ITEM_LIST_GAP_CLASS = "space-y-px";

/** Two-column squares layout for board item objects. */
export const BOARD_ITEM_SQUARES_CLASS =
  "grid grid-cols-2 gap-1.5 [grid-auto-rows:minmax(0,auto)]";

export type BoardColumnTone = "inbox" | "today" | "notes";

export function boardItemsLayoutClass(view: "list" | "squares"): string {
  return view === "squares" ? BOARD_ITEM_SQUARES_CLASS : BOARD_ITEM_LIST_GAP_CLASS;
}

/** Subtle top edge + wash before the scrollable item list (tone-matched per board). */
export function boardItemsZoneClass(column: BoardColumnTone): string {
  const toneClass: Record<BoardColumnTone, string> = {
    inbox: "border-slate-200/90 from-slate-50/80",
    today: "border-blue-200/80 from-blue-50/55",
    notes: "border-orange-200/80 from-orange-50/55",
  };
  return [
    "min-h-0 flex-1 border-t pt-1 mt-0",
    "bg-gradient-to-b to-transparent",
    "lg:pt-1 lg:mt-0",
    toneClass[column],
  ].join(" ");
}
