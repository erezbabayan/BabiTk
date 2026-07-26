export type BoardItemView = "list" | "squares";

const STORAGE_KEY = "mindtasker.boardItemView";

export function isBoardItemView(value: unknown): value is BoardItemView {
  return value === "list" || value === "squares";
}

export function readBoardItemView(): BoardItemView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isBoardItemView(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

export function writeBoardItemView(view: BoardItemView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

export function toggleBoardItemView(view: BoardItemView): BoardItemView {
  return view === "list" ? "squares" : "list";
}
