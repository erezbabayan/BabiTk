import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseWidgetBoard,
  parseWidgetSnapshot,
  type WidgetBoard,
  type WidgetSnapshot,
} from "./widget-model";

// App-private storage shared by the app and the headless widget task.
// Holds titles only (no tokens, no keys).
const SNAPSHOT_KEY = "babitk.widget.snapshot.v1";
const boardKey = (widgetId: number) => `babitk.widget.board.${widgetId}`;

export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    return parseWidgetSnapshot(await AsyncStorage.getItem(SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function readWidgetBoard(widgetId: number): Promise<WidgetBoard> {
  try {
    return parseWidgetBoard(await AsyncStorage.getItem(boardKey(widgetId))) ?? "inbox";
  } catch {
    return "inbox";
  }
}

export async function writeWidgetBoard(widgetId: number, board: WidgetBoard): Promise<void> {
  await AsyncStorage.setItem(boardKey(widgetId), board);
}

export async function forgetWidget(widgetId: number): Promise<void> {
  await AsyncStorage.removeItem(boardKey(widgetId));
}
