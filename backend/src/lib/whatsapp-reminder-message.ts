export type ReminderKind = "task" | "note" | "list";

export type ReminderDestination =
  | { kind: "group"; chatId: string }
  | { kind: "phone"; phone: string }
  | { kind: "none" };

export function isWhatsAppGroupChatId(chatId: string | null | undefined): boolean {
  return (chatId?.trim().toLowerCase() ?? "").endsWith("@g.us");
}

export function resolveReminderDestination(user: {
  notify_whatsapp_group?: boolean | null;
  whatsapp_capture_group_chat_id?: string | null;
  phone?: string | null;
  phone_verified?: boolean | null;
}): ReminderDestination {
  const groupId = user.whatsapp_capture_group_chat_id?.trim() ?? "";
  if (user.notify_whatsapp_group === true && isWhatsAppGroupChatId(groupId)) {
    return { kind: "group", chatId: groupId };
  }
  const phone = user.phone?.trim() ?? "";
  if (user.phone_verified === true && phone.length > 0) {
    return { kind: "phone", phone };
  }
  return { kind: "none" };
}

export function formatReminderDueLabel(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildWhatsAppReminderMessage(
  title: string,
  dueDate: string | null | undefined,
  kind: ReminderKind = "task",
): string {
  const dueLabel = formatReminderDueLabel(dueDate);
  const kindLabel = kind === "list" ? "רשימה" : kind === "note" ? "הערה" : "משימה";
  const lines = [`⏰ תזכורת ${kindLabel} מ-BabiTk`, "", title.trim() || "תזכורת"];
  if (dueLabel) lines.push(`מועד: ${dueLabel}`);
  lines.push("", "סיים או עדכן באפליקציה / באתר.");
  return lines.join("\n");
}

export function resolveItemNotifyAt(item: {
  is_actionable?: boolean | null;
  due_date?: string | null;
  metadata?: unknown;
}): string | null {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  if (metadata.reminder_disabled === true) return null;
  const analysis =
    metadata.analysis && typeof metadata.analysis === "object"
      ? (metadata.analysis as Record<string, unknown>)
      : undefined;
  if (item.is_actionable) {
    if (typeof analysis?.notify_at === "string" && analysis.notify_at.trim()) {
      return analysis.notify_at;
    }
    return item.due_date ?? null;
  }
  if (metadata.reminder_manual === true && item.due_date) {
    return item.due_date;
  }
  return null;
}

export function resolveGreenApiChatId(toPhoneOrChatId: string): string {
  const raw = toPhoneOrChatId.trim();
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("יעד וואטסאפ לא תקין");
  }
  return `${digits}@c.us`;
}
