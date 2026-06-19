import type { MindtaskerItem } from "./supabase";

export type BoardTab = "inbox" | "today" | "notes";

export const BOARD_TAB_LABELS: Record<BoardTab, string> = {
  inbox: "המחברת",
  today: "משימות",
  notes: "הערות",
};

/** Short approve label (matches web ItemCard). */
export function inboxTransferLabel(_item: MindtaskerItem): string {
  return "אשר ✓";
}

export function archiveRestoreLabel(_item: MindtaskerItem): string {
  return "שחזר ✓";
}

export function listViewTitle(tab: BoardTab, listView: "active" | "archive" | "completed"): string {
  if (tab === "inbox") {
    return listView === "archive" ? "ארכיון" : BOARD_TAB_LABELS.inbox;
  }
  if (tab === "today") {
    if (listView === "completed") return "משימות שהושלמו";
    if (listView === "archive") return "ארכיון משימות";
    return "משימות לביצוע";
  }
  return listView === "archive" ? "ארכיון הערות" : "מאגר ידע-הערות";
}

export function searchPlaceholder(
  tab: BoardTab,
  listView: "active" | "archive" | "completed",
): string {
  if (listView === "archive") {
    return "חפש...";
  }
  if (listView === "completed") {
    return "חפש...";
  }
  switch (tab) {
    case "inbox":
      return "חפש...";
    case "today":
      return "חפש...";
    case "notes":
      return "חפש...";
  }
}

export function emptyListMessage(
  tab: BoardTab,
  listView: "active" | "archive" | "completed",
): string {
  if (listView === "archive") {
    if (tab === "notes") {
      return "אין הערות בארכיון. ניתן להעביר הערה לארכיון מכפתור «ארכיון» בכרטיס.";
    }
    return "אין משימות בארכיון. פריטים שלא נוגעו בהם 48 שעות עוברים לכאן, או מכפתור «ארכיון» במשימה.";
  }
  if (listView === "completed") {
    return "אין משימות שהושלמו.";
  }
  switch (tab) {
    case "inbox":
      return "המחברת ריקה";
    case "today":
      return "אין משימות לביצוע";
    case "notes":
      return "אין הערות שמורות";
  }
}
