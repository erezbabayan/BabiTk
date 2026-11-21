import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { BabiTkWidget } from "./BabiTkWidget";
import {
  buildWidgetSnapshot,
  signedOutSnapshot,
  snapshotsEqualIgnoringTime,
  widgetSizeForHeight,
  WIDGET_NAME,
  type WidgetBoard,
  type WidgetSourceItem,
} from "./widget-model";
import { readWidgetBoard, readWidgetSnapshot, writeWidgetSnapshot } from "./widget-storage";

async function redrawWidgets(): Promise<void> {
  const snapshot = await readWidgetSnapshot();
  const boards = new Map<number, WidgetBoard>();
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: async (info) => {
      const board = boards.get(info.widgetId) ?? (await readWidgetBoard(info.widgetId));
      boards.set(info.widgetId, board);
      return <BabiTkWidget snapshot={snapshot} board={board} size={widgetSizeForHeight(info.height)} />;
    },
    widgetNotFound: () => undefined,
  });
}

/** Called by the app after its boards load or change. Never throws. */
export async function syncWidgetBoards(
  boards: Record<WidgetBoard, readonly WidgetSourceItem[]>,
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const next = buildWidgetSnapshot(boards);
    const previous = await readWidgetSnapshot();
    // Skip identical content unless the old one is getting old (keeps "updated" fresh).
    if (snapshotsEqualIgnoringTime(previous, next) && previous && next.updatedAt - previous.updatedAt < 10 * 60_000) {
      return;
    }
    await writeWidgetSnapshot(next);
    await redrawWidgets();
  } catch {
    // The widget is best-effort; never disturb the app.
  }
}

/** Called on sign-out so the widget stops showing the previous user's items. */
export async function clearWidgetBoards(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await writeWidgetSnapshot(signedOutSnapshot());
    await redrawWidgets();
  } catch {
    // ignore
  }
}
