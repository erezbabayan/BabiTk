export type BoardToolbarTone = "slate" | "blue" | "orange";

/** Shared bordered style for board toolbar controls (search row). */
export const BOARD_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-6 max-w-full shrink items-center truncate rounded-md border border-slate-300/90 bg-white/95 px-1.5 text-[9px] leading-none shadow-sm hover:bg-white disabled:opacity-50";

export const BOARD_TOOLBAR_ICON_BUTTON_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300/90 bg-white/95 shadow-sm hover:bg-white disabled:opacity-50";

const TOOLBAR_TEXT: Record<BoardToolbarTone, string> = {
  slate: "text-slate-700",
  blue: "text-blue-700",
  orange: "text-orange-700",
};

export function boardToolbarButtonClass(tone: BoardToolbarTone): string {
  return `${BOARD_TOOLBAR_BUTTON_CLASS} ${TOOLBAR_TEXT[tone]}`;
}

export function boardToolbarIconButtonClass(tone: BoardToolbarTone): string {
  return `${BOARD_TOOLBAR_ICON_BUTTON_CLASS} ${TOOLBAR_TEXT[tone]}`;
}
