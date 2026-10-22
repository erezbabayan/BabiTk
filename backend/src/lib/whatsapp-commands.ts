/**
 * Parse WhatsApp reply text / button payloads into board actions.
 * Works across Meta, Green-API, and Whapi because it is text-first.
 */

export type WhatsAppCommandAction =
  | { type: "complete"; index: number | null; itemId?: string }
  | { type: "snooze"; index: number | null; itemId?: string; hours: number }
  | { type: "tomorrow"; index: number | null; itemId?: string; hour: number }
  | { type: "nextWeek"; index: number | null; itemId?: string }
  | { type: "undo" };

export { parseWhatsAppQuery, buildTaskBriefing, isSystemWhatsAppReply } from "./whatsapp-query.js";

const DONE_RE =
  /^(?:בוצע|סיימתי|סיום|done|complete)(?:\s+(\d+))?$/iu;
const SNOOZE_RE =
  /^(?:דחה|דחייה|snooze)(?:\s+(\d+))?(?:\s+(?:שעתיים|2h|2 שעות))?$/iu;
const SNOOZE_HOURS_RE =
  /^(?:דחה|snooze)\s+(?:ל-?)?(\d+)\s*שע(?:ות|ה)?$/iu;
const SNOOZE_ONE_HOUR_RE = /^(?:עוד\s+שעה|דחה\s+שעה)(?:\s+(\d+))?$/iu;
const UNDO_RE = /^(?:בטל(?:\s+אחרון|\s+פעולה)?|undo|ביטול)$/iu;
const TOMORROW_MORNING_RE = /^(?:מחר\s+בבוקר)(?:\s+(\d+))?$/iu;
const TOMORROW_RE =
  /^(?:מחר)(?:\s+(\d+))?(?:\s*(?:ב-?)?(\d{1,2})(?::(\d{2}))?)?$/iu;
const NUMBERED_DONE_RE = /^(\d+)\s*(?:בוצע|סיימתי|done)$/iu;
const NUMBERED_SNOOZE_RE = /^(\d+)\s*(?:דחה|snooze)(?:\s+שעתיים)?$/iu;
const NEXT_WEEK_RE = /^(?:דחה\s+לשבוע\s+הבא)(?:\s+(\d+))?$/iu;
const PAYLOAD_RE = /^(done|snooze1h|snooze2h|tomorrow|week|undo)(?::([0-9a-fA-F-]{4,}))?$/i;

export function parseWhatsAppCommand(raw: string): WhatsAppCommandAction | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const payload = text.match(PAYLOAD_RE);
  if (payload) {
    const kind = payload[1]!.toLowerCase();
    const itemId = payload[2];
    if (kind === "undo") return { type: "undo" };
    if (kind === "done") return { type: "complete", index: null, itemId };
    if (kind === "snooze1h") return { type: "snooze", index: null, itemId, hours: 1 };
    if (kind === "snooze2h") {
      return { type: "snooze", index: null, itemId, hours: 2 };
    }
    if (kind === "week") return { type: "nextWeek", index: null, itemId };
    return { type: "tomorrow", index: null, itemId, hour: 9 };
  }

  const nextWeek = text.match(NEXT_WEEK_RE);
  if (nextWeek) {
    return { type: "nextWeek", index: nextWeek[1] ? Number(nextWeek[1]) : null };
  }

  if (UNDO_RE.test(text)) return { type: "undo" };

  const oneHour = text.match(SNOOZE_ONE_HOUR_RE);
  if (oneHour) {
    return {
      type: "snooze",
      index: oneHour[1] ? Number(oneHour[1]) : null,
      hours: 1,
    };
  }

  const numberedDone = text.match(NUMBERED_DONE_RE);
  if (numberedDone) {
    return { type: "complete", index: Number(numberedDone[1]) };
  }

  const numberedSnooze = text.match(NUMBERED_SNOOZE_RE);
  if (numberedSnooze) {
    return { type: "snooze", index: Number(numberedSnooze[1]), hours: 2 };
  }

  const done = text.match(DONE_RE);
  if (done) {
    return {
      type: "complete",
      index: done[1] ? Number(done[1]) : null,
    };
  }

  const snoozeHours = text.match(SNOOZE_HOURS_RE);
  if (snoozeHours) {
    return { type: "snooze", index: null, hours: Number(snoozeHours[1]) };
  }

  const snooze = text.match(SNOOZE_RE);
  if (snooze) {
    return {
      type: "snooze",
      index: snooze[1] ? Number(snooze[1]) : null,
      hours: /שעתיים|2h|2 שעות/i.test(text) ? 2 : 2,
    };
  }

  const tomorrowMorning = text.match(TOMORROW_MORNING_RE);
  if (tomorrowMorning) {
    return {
      type: "tomorrow",
      index: tomorrowMorning[1] ? Number(tomorrowMorning[1]) : null,
      hour: 9,
    };
  }

  const tomorrow = text.match(TOMORROW_RE);
  if (tomorrow) {
    const maybeIndex = tomorrow[1] ? Number(tomorrow[1]) : null;
    const maybeHour = tomorrow[2] ? Number(tomorrow[2]) : 9;
    // "מחר 1" is item index; "מחר ב-9" is hour; "מחר 9" is hour if 0-23 and no second group
    if (maybeIndex !== null && maybeIndex >= 1 && maybeIndex <= 20 && !tomorrow[2]) {
      return { type: "tomorrow", index: maybeIndex, hour: 9 };
    }
    const hour = Number.isFinite(maybeHour) && maybeHour >= 0 && maybeHour <= 23 ? maybeHour : 9;
    return { type: "tomorrow", index: null, hour };
  }

  return null;
}

export function resolveCommandItemId(
  command: WhatsAppCommandAction,
  lastItemIds: string[],
): string | null {
  if (command.type === "undo") return null;
  if (command.itemId) return command.itemId;
  if (lastItemIds.length === 0) return null;
  if (command.index === null) {
    return lastItemIds.length === 1 ? lastItemIds[0]! : lastItemIds[0]!;
  }
  const idx = command.index - 1;
  return lastItemIds[idx] ?? null;
}

export function buildCaptureConfirmation(items: Array<{ title: string }>): string {
  if (items.length === 0) {
    return "קלטתי, אבל לא נוצרו פריטים. נסו לנסח מחדש.";
  }
  const lines = items.map((item, i) => `${i + 1}. ${item.title}`);
  const noun = items.length === 1 ? "פריט" : "פריטים";
  return (
    `נפתחו ${items.length} ${noun} בתיבה:\n` +
    `${lines.join("\n")}\n\n` +
    `השב:\n` +
    `• בוצע / בוצע 1\n` +
    `• דחה שעתיים\n` +
    `• עוד שעה\n` +
    `• מחר\n` +
    `• דחה לשבוע הבא\n` +
    `• בטל — מבטל את הפעולה האחרונה\n` +
    `• תפריט — שאלות מובנות (מה יש היום / מחר / עבודה)`
  );
}

export function buildReminderActionText(title: string, dueLabel: string | null): string {
  return (
    `⏰ תזכורת: ${title}` +
    (dueLabel ? `\nמועד יעד: ${dueLabel}` : "") +
    `\n\nהשב «בוצע» או «דחה שעתיים» או «מחר» או «דחה לשבוע הבא».`
  );
}
