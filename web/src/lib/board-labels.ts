export type BoardTab = "inbox" | "today" | "notes";

/** Small caps label above each notebook board tab (BabiTk-style). */
export const BOARD_TAB_KICKER = "NOTEBOOK";

export const BOARD_TAB_LABELS: Record<BoardTab, string> = {
  inbox: "המחברת",
  today: "משימות לביצוע",
  notes: "הערות",
};

export function withItemCount(title: string, count: number): string {
  return `${title} (${count})`;
}

export function listViewTitle(
  tab: BoardTab,
  listView: "active" | "archive" | "completed",
  count?: number,
): string {
  let title: string;
  if (tab === "inbox") {
    title = listView === "archive" ? "ארכיון" : BOARD_TAB_LABELS.inbox;
  } else if (tab === "today") {
    if (listView === "completed") title = "משימות שהושלמו";
    else if (listView === "archive") title = "ארכיון משימות";
    else title = BOARD_TAB_LABELS.today;
  } else {
    title = listView === "archive" ? "ארכיון הערות" : "מאגר ידע-הערות";
  }
  return count === undefined ? title : withItemCount(title, count);
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
