import { addZonedDays, addZonedMinutes, getZonedParts } from "../utils/timezone.js";
import {
  parseWhatsAppCommand,
  resolveCommandItemId,
} from "../lib/whatsapp-commands.js";
import {
  builtInMenuQuestions,
  buildTaskBriefing,
  buildWhatsAppMenuText,
  isBareWhatsAppMenuPick,
  isWhatsAppMenuRequest,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  parseMenuSelection,
  parseWhatsAppQuery,
  type WhatsAppQuery,
} from "../lib/whatsapp-query.js";
import {
  normalizeSpokenWhatsAppQuestion,
  parseWhatsAppInboundQuestion,
} from "../lib/whatsapp-system-question.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { env } from "../config/env.js";
import {
  completeItem,
  getItemById,
  snoozeItem,
} from "./items.service.js";
import { getUserTagNames } from "./user-tags.service.js";
import { sendWhatsAppText } from "./whatsapp/send.js";
import type { DbMindtaskerItem } from "../types/database.js";

const TIMEZONE = "Asia/Jerusalem";

export type LinkedWhatsAppUser = {
  id: string;
  phone: string | null;
  whatsapp_last_item_ids?: string[] | null;
  whatsapp_capture_group_chat_id?: string | null;
  notify_whatsapp?: boolean | null;
  onboarding_completed_at?: string | null;
};

export function replyDestination(message: { from: string; chatId?: string }): string {
  if (message.chatId?.endsWith("@g.us")) return message.chatId;
  return message.from;
}

export async function listOpenTasks(userId: string): Promise<DbMindtaskerItem[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, user_id, title, content, is_actionable, status, due_date, tags, metadata")
    .eq("user_id", userId)
    .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to list open tasks: ${error.message}`);
  }
  return (data ?? []) as DbMindtaskerItem[];
}

export function filterTasksForQuery(
  items: DbMindtaskerItem[],
  query: WhatsAppQuery,
  now = new Date(),
): DbMindtaskerItem[] {
  return items.filter(
    (item) =>
      itemMatchesBriefingDay(item, query.day, now, TIMEZONE) &&
      itemMatchesQueryTag(item, query.tag),
  );
}

export async function rememberLastWhatsAppItems(
  userId: string,
  itemIds: string[],
): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("users")
    .update({ whatsapp_last_item_ids: itemIds.slice(0, 12) })
    .eq("id", userId);
}

export async function loadLastWhatsAppItemIds(userId: string): Promise<string[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("whatsapp_last_item_ids")
    .eq("id", userId)
    .maybeSingle();
  const ids = data?.whatsapp_last_item_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export async function handleWhatsAppTextIntent(options: {
  user: LinkedWhatsAppUser;
  text: string;
  replyTo: string;
}): Promise<boolean> {
  const raw = options.text.trim();
  if (!raw) return false;
  const allowedTags = await getUserTagNames(options.user.id);
  const menu = builtInMenuQuestions(allowedTags);
  const spoken = normalizeSpokenWhatsAppQuestion(raw);
  const systemQuestion = parseWhatsAppInboundQuestion(raw);
  const intentText =
    systemQuestion.kind === "question" ? systemQuestion.question : spoken || raw;
  const prefixed = systemQuestion.kind !== "none";

  if (systemQuestion.kind === "help" || isWhatsAppMenuRequest(raw) || isWhatsAppMenuRequest(spoken)) {
    await sendWhatsAppText(options.replyTo, buildWhatsAppMenuText(menu));
    await markWhatsAppOnboardingComplete(options.user.id);
    return true;
  }

  const numberedPick =
    isBareWhatsAppMenuPick(raw) || isBareWhatsAppMenuPick(spoken)
      ? parseMenuSelection(raw.trim() || spoken, menu)
      : null;
  const query = prefixed ? parseWhatsAppQuery(intentText, allowedTags) : numberedPick;
  if (query) {
    const tasks = filterTasksForQuery(await listOpenTasks(options.user.id), query);
    await rememberLastWhatsAppItems(
      options.user.id,
      tasks.map((item) => item.id),
    );
    await sendWhatsAppText(options.replyTo, buildTaskBriefing(tasks, query, TIMEZONE));
    return true;
  }

  const command = parseWhatsAppCommand(raw);
  if (!command) return false;

  const lastIds = await loadLastWhatsAppItemIds(options.user.id);
  const itemId = resolveCommandItemId(command, lastIds);
  if (!itemId) {
    await sendWhatsAppText(
      options.replyTo,
      "לא מצאתי פריט אחרון. כתבו «תפריט» או בחרו מספר אחרי הקליטה.",
    );
    return true;
  }

  const now = new Date();
  if (command.type === "complete") {
    const item = await completeItem(options.user.id, itemId);
    await sendWhatsAppText(options.replyTo, `סומן כבוצע: ${item.title}`);
    return true;
  }

  if (command.type === "snooze") {
    const due = addZonedMinutes(TIMEZONE, now, command.hours * 60);
    const item = await snoozeItem(options.user.id, itemId, due);
    await sendWhatsAppText(options.replyTo, `נדחה ל-${formatClock(due)}: ${item.title}`);
    return true;
  }

  const due = addZonedDays(TIMEZONE, now, 1, command.hour, 0);
  const item = await snoozeItem(options.user.id, itemId, due);
  await sendWhatsAppText(options.replyTo, `עודכן ל-מחר ${String(command.hour).padStart(2, "0")}:00: ${item.title}`);
  return true;
}

function formatClock(iso: string): string {
  const parts = getZonedParts(new Date(iso), TIMEZONE);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export async function markWhatsAppOnboardingComplete(userId: string): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_completed_at", null);
}

export async function maybeSendWhatsAppMenuOnboarding(options: {
  user: LinkedWhatsAppUser;
  replyTo: string;
  isGroup: boolean;
}): Promise<void> {
  if (!options.isGroup || !env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", options.user.id)
    .maybeSingle();
  if (data?.onboarding_completed_at) return;

  const allowedTags = await getUserTagNames(options.user.id);
  const menu = builtInMenuQuestions(allowedTags);
  await sendWhatsAppText(
    options.replyTo,
    `בקבוצה הזו אפשר לשאול שאלות מובנות — בחרו מספר או כתבו «תפריט» שוב בכל עת.\n\n${buildWhatsAppMenuText(menu)}`,
  );
  await markWhatsAppOnboardingComplete(options.user.id);
}

export { getItemById };
