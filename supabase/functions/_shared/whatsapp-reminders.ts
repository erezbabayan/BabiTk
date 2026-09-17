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

export function resolveGreenApiChatId(toPhoneOrChatId: string): string {
  const raw = toPhoneOrChatId.trim();
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("יעד וואטסאפ לא תקין");
  }
  return `${digits}@c.us`;
}

export async function sendGreenApiChatMessage(
  gateway: { instance_id: string; api_token: string; api_url: string },
  toPhoneOrChatId: string,
  message: string,
): Promise<void> {
  const base = (gateway.api_url || "https://api.greenapi.com").replace(/\/$/, "");
  const url = `${base}/waInstance${gateway.instance_id}/sendMessage/${gateway.api_token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: resolveGreenApiChatId(toPhoneOrChatId),
      message,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Green-API send failed: ${response.status} ${detail}`.trim());
  }
}
