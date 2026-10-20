import { featureFlags } from "../lib/feature-flags.js";
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
  followUpQuickReplies,
  isProactiveDue,
  localDateKey,
  MAX_PROACTIVE_PER_DAY,
  partitionOpenTasks,
  proactiveSlotKey,
  slotAlreadySent,
  PROACTIVE_TIMEZONE,
  type ProactiveTask,
} from "../lib/proactive-whatsapp.js";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sendWhatsAppOutbound } from "./whatsapp/outbound.js";
import { resolveReminderDestination } from "../lib/whatsapp-reminder-message.js";
import { normalizePhone } from "./items.service.js";

type UserRow = {
  id: string;
  phone: string | null;
  phone_verified: boolean | null;
  notify_whatsapp_group: boolean | null;
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_morning_briefing_enabled?: boolean | null;
  whatsapp_morning_briefing_hour?: number | null;
  whatsapp_morning_briefing_minute?: number | null;
  whatsapp_followup_enabled?: boolean | null;
  whatsapp_followup_hour?: number | null;
  whatsapp_proactive_slots?: string[] | null;
};

type GatewayRow = { instance_id: string; api_token: string; api_url: string };

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /does not exist|Could not find the column/i.test(message);
}

async function loadTasks(userId: string): Promise<ProactiveTask[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, title, due_date")
    .eq("user_id", userId)
    .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    dueAt: typeof row.due_date === "string" ? row.due_date : null,
  }));
}

async function deliver(
  user: UserRow,
  gateway: GatewayRow | null,
  body: string,
  quickReplies?: { id: string; title: string }[],
): Promise<boolean> {
  const destination = resolveReminderDestination(user);
  if (destination.kind === "none") return false;
  const to = destination.kind === "group" ? destination.chatId : normalizePhone(destination.phone);
  if (destination.kind === "group" && !gateway) return false;
  await sendWhatsAppOutbound(
    { to, body, quickReplies },
    gateway
      ? { instanceId: gateway.instance_id, token: gateway.api_token, baseUrl: gateway.api_url }
      : null,
  );
  return true;
}

/**
 * Morning briefing and unfinished-task follow-up.
 * No-ops unless the matching env flag is on. Shares slot keys with the Edge
 * dispatcher, so a user is messaged once even if both processes run.
 */
export async function sendProactiveWhatsApp(now = new Date()): Promise<{
  briefings: number;
  followups: number;
}> {
  if (!env.isSupabaseConfigured) return { briefings: 0, followups: 0 };
  if (!featureFlags.morningBriefing && !featureFlags.followUp) {
    return { briefings: 0, followups: 0 };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id, whatsapp_morning_briefing_enabled, whatsapp_morning_briefing_hour, whatsapp_morning_briefing_minute, whatsapp_followup_enabled, whatsapp_followup_hour, whatsapp_proactive_slots",
    )
    .eq("phone_verified", true);
  if (error) {
    if (missingColumn(error)) return { briefings: 0, followups: 0 };
    throw new Error(error.message);
  }

  const dateKey = localDateKey(now, PROACTIVE_TIMEZONE);
  let briefings = 0;
  let followups = 0;

  for (const row of (data ?? []) as UserRow[]) {
    const { data: gateway } = await supabase
      .from("whatsapp_gateways")
      .select("instance_id, api_token, api_url")
      .eq("user_id", row.id)
      .maybeSingle();
    let slots = row.whatsapp_proactive_slots ?? [];

    const sendSlot = async (
      kind: "briefing" | "followup",
      hour: number,
      body: string,
      quickReplies?: { id: string; title: string }[],
    ) => {
      const key = proactiveSlotKey(kind, dateKey, hour);
      if (slotAlreadySent(slots, key)) return false;
      if (countProactiveSlots(slots, dateKey) >= MAX_PROACTIVE_PER_DAY) return false;
      const delivered = await deliver(row, (gateway as GatewayRow | null) ?? null, body, quickReplies);
      if (!delivered) return false;
      slots = appendProactiveSlot(slots, key, dateKey);
      const { error: updateError } = await supabase
        .from("users")
        .update({ whatsapp_proactive_slots: slots })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      return true;
    };

    try {
      if (
        featureFlags.morningBriefing &&
        row.whatsapp_morning_briefing_enabled === true
      ) {
        const hour = clampHour(row.whatsapp_morning_briefing_hour, DEFAULT_BRIEFING_HOUR);
        const minute = clampMinute(row.whatsapp_morning_briefing_minute, DEFAULT_BRIEFING_MINUTE);
        if (isProactiveDue(now, hour, minute)) {
          const groups = partitionOpenTasks(await loadTasks(row.id), now);
          const body = buildMorningBriefingMessage(groups, dateKey);
          if (await sendSlot("briefing", hour, body, followUpQuickReplies())) briefings += 1;
        }
      }

      if (featureFlags.followUp && row.whatsapp_followup_enabled === true) {
        const hour = clampHour(row.whatsapp_followup_hour, DEFAULT_FOLLOWUP_HOUR);
        if (isProactiveDue(now, hour, 0)) {
          const groups = partitionOpenTasks(await loadTasks(row.id), now);
          const open = [...groups.overdue, ...groups.today];
          if (open.length > 0) {
            const body = buildFollowUpMessage(open);
            const replies = open.length === 1 ? followUpQuickReplies(open[0]!.id) : followUpQuickReplies();
            if (await sendSlot("followup", hour, body, replies)) followups += 1;
          }
        }
      }
    } catch {
      // Next 15-minute tick retries until the slot is stored.
    }
  }

  return { briefings, followups };
}
