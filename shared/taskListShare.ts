import { formatListReminderAt, isListReminderActive } from "./taskListNames";

const APP_NAME = "BabiTk";

export interface TaskListShareItem {
  title: string;
  status: string;
}

export interface TaskListShareInput {
  name: string;
  filterTags?: string[];
  reminderAt?: string | null;
  items: TaskListShareItem[];
}

function isShareItemDone(item: TaskListShareItem): boolean {
  return item.status === "completed" || item.status === "snoozed_archive";
}

function formatShareItemLine(item: TaskListShareItem): string {
  const title = item.title.trim() || "ללא כותרת";
  if (isShareItemDone(item)) {
    return `~${title}~`;
  }
  return `- ${title}`;
}

/** Plain-text message for sharing a task list via WhatsApp. */
export function formatTaskListWhatsAppMessage(list: TaskListShareInput): string {
  const listTitle = list.name.trim() || "רשימה";
  const lines: string[] = [`*${APP_NAME} — ${listTitle}*`];

  const tags = (list.filterTags ?? []).filter(Boolean);
  if (tags.length > 0) {
    lines.push(tags.map((tag) => tag.trim().replace(/^#+/, "")).join(" "));
  }

  if (list.reminderAt && isListReminderActive(list.reminderAt)) {
    lines.push(`תזכורת: ${formatListReminderAt(list.reminderAt)}`);
  }

  lines.push("");

  if (list.items.length === 0) {
    lines.push("אין משימות ברשימה זו");
  } else {
    for (const item of list.items) {
      lines.push(formatShareItemLine(item));
    }
  }

  return lines.join("\n");
}

export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
