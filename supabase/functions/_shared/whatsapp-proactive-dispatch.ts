import {
  appendProactiveSlot,
  buildFollowUpMessage,
  buildMorningBriefingMessage,
  clampHour,
  clampMinute,
  countProactiveSlots,
  DEFAULT_BRIEFING_HOUR,
  DEFAULT_BRIEFING_MINUTE,
  DEFAULT_FOLLOWUP_HOUR,
  isProactiveDue,
  localDateKey,
  MAX_PROACTIVE_PER_DAY,
  partitionOpenTasks,
  proactiveSlotKey,
  PROACTIVE_TIMEZONE,
  slotAlreadySent,
  type ProactiveTask,
} from "./proactive-whatsapp.ts";

type Admin = {
  from: (table: string) => any;
};

function flag(name: string): boolean {
  const raw = Deno.env.get(name)?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /does not exist|Could not find the column/i.test(message);
}

/**
 * Same slot keys as the API cron, so a user gets one briefing even if both run.
 * Skips the new columns entirely when both flags are off.
 */
export async function dispatchProactiveWhatsApp(
  admin: Admin,
  deliver: (userId: string, message: string) => Promise<boolean>,
  now = new Date(),
): Promise<{ briefings: number; followups: number }> {
  if (!flag("WHATSAPP_MORNING_BRIEFING") && !flag("WHATSAPP_FOLLOWUP")) {
    return { briefings: 0, followups: 0 };
  }

  const { data, error } = await admin
    .from("users")
    .select(
      "id, whatsapp_morning_briefing_enabled, whatsapp_morning_briefing_hour, whatsapp_morning_briefing_minute, whatsapp_followup_enabled, whatsapp_followup_hour, whatsapp_proactive_slots",
    )
    .eq("phone_verified", true);
  if (error) {
    if (missingColumn(error)) return { briefings: 0, followups: 0 };
    throw new Error(error.message);
  }

  const dateKey = localDateKey(now, PROACTIVE_TIMEZONE);
  let briefings = 0;
  let followups = 0;

  for (const row of data ?? []) {
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

    const sendSlot = async (kind: "briefing" | "followup", hour: number, body: string) => {
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
      if (flag("WHATSAPP_MORNING_BRIEFING") && row.whatsapp_morning_briefing_enabled === true) {
        const hour = clampHour(row.whatsapp_morning_briefing_hour, DEFAULT_BRIEFING_HOUR);
        const minute = clampMinute(row.whatsapp_morning_briefing_minute, DEFAULT_BRIEFING_MINUTE);
        if (isProactiveDue(now, hour, minute)) {
          const body = buildMorningBriefingMessage(partitionOpenTasks(await loadTasks(), now), dateKey);
          if (await sendSlot("briefing", hour, body)) briefings += 1;
        }
      }
      if (flag("WHATSAPP_FOLLOWUP") && row.whatsapp_followup_enabled === true) {
        const hour = clampHour(row.whatsapp_followup_hour, DEFAULT_FOLLOWUP_HOUR);
        if (isProactiveDue(now, hour, 0)) {
          const groups = partitionOpenTasks(await loadTasks(), now);
          const open = [...groups.overdue, ...groups.today];
          if (open.length > 0 && (await sendSlot("followup", hour, buildFollowUpMessage(open)))) {
            followups += 1;
          }
        }
      }
    } catch (error) {
      console.error("proactive whatsapp failed", error);
    }
  }

  return { briefings, followups };
}
