/**
 * Master switches. New WhatsApp features default on.
 * Proactive sends still need the user's opt-in and stay under 3 a day.
 * Set a variable to false / 0 / off to turn that feature off.
 */
import { looksLikeGoogleClientId, looksLikeGoogleClientSecret } from "./google-calendar.js";
import { envFlagEnabled, proactiveDispatcherMode } from "./proactive-whatsapp.js";

function flag(name: string, defaultOn = true): boolean {
  return envFlagEnabled(process.env[name], defaultOn);
}

export const featureFlags = {
  /** Daily morning summary. Also requires the user's opt-in column. */
  get morningBriefing() {
    return flag("WHATSAPP_MORNING_BRIEFING", true);
  },
  /** Evening nudge for tasks still open. Also requires the user's opt-in. */
  get followUp() {
    return flag("WHATSAPP_FOLLOWUP", true);
  },
  /** Friday summary. Also requires the user's opt-in. */
  get weeklySummary() {
    return flag("WHATSAPP_WEEKLY_SUMMARY", true);
  },
  /** Hold proactive sends and reminders from Friday candles to Saturday havdalah. */
  get shabbatMode() {
    return flag("WHATSAPP_SHABBAT_MODE", true);
  },
  /** Split a long or voice capture into cards / a checklist. */
  get multiCard() {
    return flag("WHATSAPP_MULTI_CARD", true);
  },
  /** Store recurrence when the WhatsApp text says כל יום / כל 1 לחודש. */
  get recurrence() {
    return flag("WHATSAPP_RECURRENCE", true);
  },
  /** «בטל» restores the last capture, complete, or snooze. */
  get undo() {
    return flag("WHATSAPP_UNDO", true);
  },
  /** «תזיז ליום שני» and similar. */
  get nlCommands() {
    return flag("WHATSAPP_NL_COMMANDS", true);
  },
  /** Keyword board + priority when the user has not tagged the item. */
  get autoCategory() {
    return flag("WHATSAPP_AUTO_CATEGORY", true);
  },
  /** «מה רשמתי על …» token overlap, then embeddings when the RPC exists. */
  get semanticSearch() {
    return flag("WHATSAPP_SEMANTIC_SEARCH", true);
  },
  /** Usual times and categories once the same choice was seen twice. */
  get habits() {
    return flag("WHATSAPP_HABITS", true);
  },
  /** «לארגן יום הולדת» proposes steps and saves them only after «כן». */
  get taskBreakdown() {
    return flag("WHATSAPP_TASK_BREAKDOWN", true);
  },
  /** Hebrew phrases such as «בערב פסח» when the parser left the due date empty. */
  get jewishDates() {
    return flag("WHATSAPP_JEWISH_DATES", true);
  },
  /**
   * unset or true: Edge + API cron send, Convex stays quiet (one store of slot keys).
   * convex: only Convex sends.
   * false: nobody sends proactive WhatsApp.
   */
  get proactiveDispatcher() {
    return proactiveDispatcherMode(process.env.WHATSAPP_PROACTIVE_DISPATCHER);
  },
  /** Raw switch. Two-way sync also requires real Google OAuth credentials. */
  get calendarBidirectionalRequested() {
    return flag("GOOGLE_CALENDAR_BIDIRECTIONAL", false);
  },
  get calendarBidirectional() {
    if (!flag("GOOGLE_CALENDAR_BIDIRECTIONAL", false)) return false;
    return (
      looksLikeGoogleClientId(process.env.GOOGLE_CLIENT_ID ?? "") &&
      looksLikeGoogleClientSecret(process.env.GOOGLE_CLIENT_SECRET ?? "")
    );
  },
} as const;
