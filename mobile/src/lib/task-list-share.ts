import { Linking } from "react-native";

import {
  formatTaskListWhatsAppMessage,
  whatsAppShareUrl,
  type TaskListShareInput,
} from "../../../convex/lib/taskListShare";

export { formatTaskListWhatsAppMessage, type TaskListShareInput };

export async function openTaskListInWhatsApp(list: TaskListShareInput): Promise<void> {
  const text = formatTaskListWhatsAppMessage(list);
  const encoded = encodeURIComponent(text);
  const nativeUrl = `whatsapp://send?text=${encoded}`;
  const webUrl = whatsAppShareUrl(text);

  try {
    const canOpenNative = await Linking.canOpenURL(nativeUrl);
    await Linking.openURL(canOpenNative ? nativeUrl : webUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}
