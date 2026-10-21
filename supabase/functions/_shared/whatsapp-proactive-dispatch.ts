import {
  appendProactiveSlot,
  buildFollowUpMessage,
  buildMorningBriefingMessage,
  buildWeeklySummaryMessage,
  clampHour,
  clampMinute,
  countProactiveSlots,
  DEFAULT_BRIEFING_HOUR,
  DEFAULT_BRIEFING_MINUTE,
  DEFAULT_FOLLOWUP_HOUR,
  DEFAULT_WEEKLY_HOUR,
  envFlagEnabled,
  isProactiveDue,
  isWeeklySummaryDue,
  jerusalemDayStartIso,
  jerusalemWeekStartIso,
  localDateKey,
  MAX_PROACTIVE_PER_DAY,
  partitionOpenTasks,
  proactiveDispatcherMode,
  proactiveSlotKey,
  PROACTIVE_TIMEZONE,
  slotAlreadySent,
  type ProactiveKind,
  type ProactiveTask,
} from "./proactive-whatsapp.ts";
import { isInsideShabbatQuiet } from "./jewish-calendar.ts";

type Admin = {
  from: (table: string) => any;
};

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /does not exist|Could not find the column/i.test(message);
}

const BASE_COLUMNS =
  "id, whatsapp_morning_briefing_enabled, whatsapp_morning_briefing_hour, whatsapp_morning_briefing_minute, whatsapp_followup_enabled, whatsapp_followup_hour, whatsapp_proactive_slots";
const EXTRA_COLUMNS = `${BASE_COLUMNS}, whatsapp_weekly_summary_enabled, whatsapp_shabbat_mode_enabled`;

/**
 * Same slot keys as the API cron, so a user gets one briefing even if both run.
 * Convex sends only when WHATSAPP_PROACTIVE_DISPATCHER=convex.
 */
export async function dispatchProactiveWhatsApp(
  admin: Admin,
  deliver: (userId: string, message: string) => Promise<boolean>,
  now = new Date(),
): Promise<{ briefings: number; followups: number; weekly: number }> {
  const mode = proactiveDispatcherMode(Deno.env.get("WHATSAPP_PROACTIVE_DISPATCHER"));
  const briefingOn = envFlagEnabled(Deno.env.get("WHATSAPP_MORNING_BRIEFING"), true);
  const followOn = envFlagEnabled(Deno.env.get("WHATSAPP_FOLLOWUP"), true);
  const weeklyOn = envFlagEnabled(Deno.env.get("WHATSAPP_WEEKLY_SUMMARY"), true);
  if (mode !== "edge" || (!briefingOn && !followOn && !weeklyOn)) {
    return { briefings: 0, followups: 0, weekly: 0 };
  }

  let extended = true;
  let { data, error } = await admin.from("users").select(EXTRA_COLUMNS).eq("phone_verified", true);
  if (error && missingColumn(error)) {
    extended = false;
    ({ data, error } = await admin.from("users").select(BASE_COLUMNS).eq("phone_verified", true));
  }
  if (error) {
    if (missingColumn(error)) return { briefings: 0, followups: 0, weekly: 0 };
    throw new Error(error.message);
  }

  const dateKey = localDateKey(now, PROACTIVE_TIMEZONE);
  const quiet = envFlagEnabled(Deno.env.get("WHATSAPP_SHABBAT_MODE"), true) && isInsideShabbatQuiet(now);
  const weekStart = jerusalemWeekStartIso(now);
  let briefings = 0;
  let followups = 0;
  let weekly = 0;

  for (const row of data ?? []) {
    if (quiet && row.whatsapp_shabbat_mode_enabled !== false) continue;
    let slots: string[] = Array.isArray(row.whatsapp_proactive_slots) ? row.whatsapp_proactive_slots : [];
    const loadTasks = async (): Promise<ProactiveTask[]> => {
      const { data: items, error: itemsError } = await admin
        .from("mindtasker_items")
        .select("id, title, due_date")
        .eq("user_id", row.id)
        .eq("is_actionable", true)
        .in("status", ["inbox", "pending"])
        .is("deleted_at", null);
      if (itemsError) throw new Error(itemsError.message);
      return (items ?? []).map((item: { id: string; title: string; due_date: string | null }) => ({
        id: String(item.id),
        title: String(item.title ?? ""),
        dueAt: item.due_date,
      }));
    };

    const sendSlot = async (kind: ProactiveKind, hour: number, body: string) => {
      const key = proactiveSlotKey(kind, dateKey, hour);
      if (slotAlreadySent(slots, key)) return false;
      if (countProactiveSlots(slots, dateKey) >= MAX_PROACTIVE_PER_DAY) return false;
      const delivered = await deliver(row.id, body);
      if (!delivered) return false;
      slots = appendProactiveSlot(slots, key, dateKey);
      const { error: updateError } = await admin
        .from("users")
        .update({ whatsapp_proactive_slots: slots })
        .eq("id", row.id);
      if (updateError && !missingColumn(updateError)) throw new Error(updateError.message);
      return true;
    };

    try {
      if (briefingOn && row.whatsapp_morning_briefing_enabled === true) {
        const hour = clampHour(row.whatsapp_morning_briefing_hour, DEFAULT_BRIEFING_HOUR);
        const minute = clampMinute(row.whatsapp_morning_briefing_minute, DEFAULT_BRIEFING_MINUTE);
        if (isProactiveDue(now, hour, minute)) {
          const body = buildMorningBriefingMessage(partitionOpenTasks(await loadTasks(), now), dateKey);
          if (await sendSlot("briefing", hour, body)) briefings += 1;
        }
      }
      if (followOn && row.whatsapp_followup_enabled === true) {
        const hour = clampHour(row.whatsapp_followup_hour, DEFAULT_FOLLOWUP_HOUR);
        if (isProactiveDue(now, hour, 0)) {
          const groups = partitionOpenTasks(await loadTasks(), now);
          const open = [...groups.overdue, ...groups.today];
          if (open.length > 0 && (await sendSlot("followup", hour, buildFollowUpMessage(open)))) {
            followups += 1;
          }
        }
      }
      if (extended && weeklyOn && row.whatsapp_weekly_summary_enabled === true && isWeeklySummaryDue(now)) {
        const { data: done } = await admin
          .from("mindtasker_items")
          .select("title")
          .eq("user_id", row.id)
          .eq("status", "completed")
          .gte("completed_at", weekStart)
          .limit(12);
        const { data: stuck } = await admin
          .from("mindtasker_items")
          .select("title")
          .eq("user_id", row.id)
          .eq("is_actionable", true)
          .in("status", ["inbox", "pending"])
          .is("deleted_at", null)
          .lt("due_date", jerusalemDayStartIso(now))
          .limit(12);
        const body = buildWeeklySummaryMessage({
          completed: (done ?? []).map((item: { title?: string }) => String(item.title ?? "")),
          stuck: (stuck ?? []).map((item: { title?: string }) => String(item.title ?? "")),
        });
        if (await sendSlot("weekly", DEFAULT_WEEKLY_HOUR, body)) weekly += 1;
      }
    } catch (error) {
      console.error("proactive whatsapp failed", error);
    }
  }

  return { briefings, followups, weekly };
}
