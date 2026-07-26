import type { MindtaskerItem } from "./supabase";

export type { BoardTab } from "./board-labels";
export {
  BOARD_TAB_KICKER,
  BOARD_TAB_LABELS,
  emptyListMessage,
  listViewTitle,
  searchPlaceholder,
  withItemCount,
} from "./board-labels";

/** Target board when approving from inbox. */
export function inboxTransferLabel(item: MindtaskerItem): string {
  return item.is_actionable ? "משימות" : "הערות";
}

export function archiveRestoreLabel(_item: MindtaskerItem): string {
  return "שחזר";
}
