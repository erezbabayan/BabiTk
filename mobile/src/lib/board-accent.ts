import type { MindtaskerItem } from "./supabase";

/** Board accent identity — matches dashboard columns and brush marks. */
export type BoardAccentTone = "inbox" | "today" | "notes";

export const BOARD_ACCENT_WIDTH_PX = 3;

export const BOARD_ACCENT_COLOR: Record<BoardAccentTone, string> = {
  inbox: "#94a3b8",
  today: "#3B82F6",
  notes: "#F97316",
};

/** Accent strip on the right edge (RTL content side), matching column top borders. */
export function boardAccentSide(_tone: BoardAccentTone): "left" | "right" {
  return "right";
}

export function boardAccentColor(tone: BoardAccentTone): string {
  return BOARD_ACCENT_COLOR[tone];
}

/** Item accent follows type (task=blue, note=orange), not the host column. */
export function resolveBoardAccent(
  item: MindtaskerItem,
  _column?: BoardAccentTone,
): BoardAccentTone {
  return item.is_actionable ? "today" : "notes";
}
