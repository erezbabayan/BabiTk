import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { BabiTkWidget, WIDGET_ACTIONS } from "./BabiTkWidget";
import { nextWidgetBoard, parseWidgetBoard, widgetSizeForHeight, WIDGET_NAME } from "./widget-model";
import { forgetWidget, readWidgetBoard, readWidgetSnapshot, writeWidgetBoard } from "./widget-storage";

/**
 * Headless task run by Android for widget add/update/resize/click.
 * Always draws the local snapshot first. On the periodic update (~30 min) and on
 * add, it then tries a best-effort background fetch with the app's stored session
 * (widget-refresh.ts); on any failure the last snapshot stays on screen.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, clickAction, clickActionData } = props;
  if (widgetInfo.widgetName !== WIDGET_NAME) return;
  const id = widgetInfo.widgetId;

  if (widgetAction === "WIDGET_DELETED") {
    await forgetWidget(id).catch(() => undefined);
    return;
  }

  let board = await readWidgetBoard(id);
  if (widgetAction === "WIDGET_CLICK") {
    if (clickAction === WIDGET_ACTIONS.next) board = nextWidgetBoard(board, 1);
    else if (clickAction === WIDGET_ACTIONS.prev) board = nextWidgetBoard(board, -1);
    else if (clickAction === WIDGET_ACTIONS.select) board = parseWidgetBoard(clickActionData?.board) ?? board;
    await writeWidgetBoard(id, board).catch(() => undefined);
  }

  const snapshot = await readWidgetSnapshot();
  props.renderWidget(
    <BabiTkWidget snapshot={snapshot} board={board} size={widgetSizeForHeight(widgetInfo.height)} />,
  );

  if (widgetAction === "WIDGET_UPDATE" || widgetAction === "WIDGET_ADDED") {
    try {
      const { refreshWidgetInBackground } = require("./widget-refresh") as typeof import("./widget-refresh");
      await refreshWidgetInBackground();
    } catch {
      // Best-effort: keep the snapshot already drawn.
    }
  }
}
