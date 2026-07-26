import {
  formatTaskListWhatsAppMessage,
  whatsAppShareUrl,
  type TaskListShareInput,
} from "../../../convex/lib/taskListShare";

export { formatTaskListWhatsAppMessage, type TaskListShareInput };

export function openTaskListInWhatsApp(list: TaskListShareInput): void {
  const text = formatTaskListWhatsAppMessage(list);
  const url = whatsAppShareUrl(text);
  window.open(url, "_blank", "noopener,noreferrer");
}
