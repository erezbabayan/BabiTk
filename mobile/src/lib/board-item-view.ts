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
