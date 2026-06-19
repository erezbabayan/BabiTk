export type BoardTab = "inbox" | "today" | "notes";

export const BOARD_TAB_LABELS: Record<BoardTab, string> = {
  inbox: "המחברת",
  today: "משימות לביצוע",
  notes: "הערות",
};

export function listViewTitle(
  tab: BoardTab,
  listView: "active" | "archive" | "completed",
): string {
  if (tab === "inbox") {
    return listView === "archive" ? "ארכיון" : BOARD_TAB_LABELS.inbox;
  }
  if (tab === "today") {
    if (listView === "completed") return "משימות שהושלמו";
    if (listView === "archive") return "ארכיון משימות";
    return BOARD_TAB_LABELS.today;
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
