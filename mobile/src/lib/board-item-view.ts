import AsyncStorage from "@react-native-async-storage/async-storage";

export type BoardItemView = "list" | "squares";

const STORAGE_KEY = "mindtasker.boardItemView";

export function isBoardItemView(value: unknown): value is BoardItemView {
  return value === "list" || value === "squares";
}

export function toggleBoardItemView(view: BoardItemView): BoardItemView {
  return view === "list" ? "squares" : "list";
}

export async function readBoardItemView(): Promise<BoardItemView> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (isBoardItemView(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

export async function writeBoardItemView(view: BoardItemView): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

export type TaskBoardView = BoardItemView | "calendar";

/** Tasks board segmented view (calendar wins over list/squares), same as web. */
export function resolveTaskBoardView(
  showCalendar: boolean,
  itemView: BoardItemView,
): TaskBoardView {
  return showCalendar ? "calendar" : itemView;
}

/** v2: calendar (יומן) is the tasks-board default; older implicit list/squares state is ignored once. */
const TASK_CALENDAR_KEY = "babitk.taskBoardCalendar.v2";

export function parseTaskCalendarPref(raw: string | null | undefined): boolean {
  return raw === "0" ? false : true;
}

export async function readTaskCalendarPref(): Promise<boolean> {
  try {
    return parseTaskCalendarPref(await AsyncStorage.getItem(TASK_CALENDAR_KEY));
  } catch {
    return true;
  }
}

export async function writeTaskCalendarPref(show: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(TASK_CALENDAR_KEY, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}
