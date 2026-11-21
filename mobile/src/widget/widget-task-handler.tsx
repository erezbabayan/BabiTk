import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { BabiTkWidget, WIDGET_ACTIONS } from "./BabiTkWidget";
import { nextWidgetBoard, parseWidgetBoard, widgetSizeForHeight, WIDGET_NAME } from "./widget-model";
import { forgetWidget, readWidgetBoard, readWidgetSnapshot, writeWidgetBoard } from "./widget-storage";

/**
 * Headless task run by Android for widget add/update/resize/click.
 * Reads the local snapshot only: no network, no auth refresh, no secrets.
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
}
