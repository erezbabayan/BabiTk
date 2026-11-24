import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);

// Android home-screen widget (headless task; local snapshot, plus a best-effort background refresh).
if (Platform.OS === "android") {
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { widgetTaskHandler } = require("./src/widget/widget-task-handler");
  registerWidgetTaskHandler(widgetTaskHandler);
}
