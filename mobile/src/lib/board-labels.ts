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
  if (listView === "archive" || listView === "completed") {
    return "חפש...";
  }
  switch (tab) {
    case "inbox":
    case "today":
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
      return "אין הערות בארכיון. החלק ימינה למחיקה, שמאלה לשחזור.";
    }
    return "אין פריטים בארכיון. פריטים במחברת שלא נוגעו בהם 48 שעות עוברים לכאן אוטומטית.";
  }
  if (listView === "completed") {
    return "אין משימות שהושלמו. סמן את העיגול או החלק לסימון כבוצע.";
  }
  switch (tab) {
    case "inbox":
      return "המחברת ריקה 🎉";
    case "today":
      return "אין משימות לביצוע";
    case "notes":
      return "אין הערות שמורות";
  }
}
