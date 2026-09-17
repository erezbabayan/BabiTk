import { addZonedDays, addZonedMinutes, getZonedParts } from "../utils/timezone.js";
import {
  parseWhatsAppCommand,
  resolveCommandItemId,
} from "../lib/whatsapp-commands.js";
import {
  builtInMenuQuestions,
  buildTaskBriefing,
  buildWhatsAppMenuText,
  isWhatsAppMenuRequest,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  type WhatsAppQuery,
} from "../lib/whatsapp-query.js";
import { resolveWhatsAppTextIntent } from "../lib/whatsapp-text-intent.js";
import {
  answerWhatsAppSystemQuestion,
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

export async function listOpenItems(userId: string): Promise<DbMindtaskerItem[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, user_id, title, content, is_actionable, status, due_date, tags, metadata")
    .eq("user_id", userId)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to list open items: ${error.message}`);
  }
  return (data ?? []) as DbMindtaskerItem[];
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
  const resolved = resolveWhatsAppTextIntent(raw, allowedTags);

  if (resolved.type === "skip") return true;
  if (resolved.type === "ingest") return false;

  if (resolved.type === "menu" || isWhatsAppMenuRequest(raw)) {
    await sendWhatsAppText(options.replyTo, buildWhatsAppMenuText(menu));
    await markWhatsAppOnboardingComplete(options.user.id);
    return true;
  }

  if (resolved.type === "query") {
    const open = await listOpenTasks(options.user.id);
    const tasks = filterTasksForQuery(open, resolved.query);
    if (tasks.length === 0 && resolved.fallbackSearch) {
      const all = await listOpenItems(options.user.id);
      const reply = answerWhatsAppSystemQuestion(
        { kind: "question", question: resolved.fallbackSearch },
        all.map((item) => ({
          title: item.title,
          content: item.content ?? "",
          isActionable: item.is_actionable,
          dueDate: item.due_date,
          tags: item.tags,
          status: item.status,
        })),
      );
      await sendWhatsAppText(options.replyTo, reply);
      return true;
    }
    await rememberLastWhatsAppItems(
      options.user.id,
      tasks.map((item) => item.id),
    );
    const inboxCount = open.filter((item) => item.status === "inbox").length;
    await sendWhatsAppText(
      options.replyTo,
      buildTaskBriefing(tasks, resolved.query, TIMEZONE, { inboxCount }),
    );
    return true;
  }

  if (resolved.type === "search") {
    const all = await listOpenItems(options.user.id);
    const reply = answerWhatsAppSystemQuestion(
      resolved.parsed,
      all.map((item) => ({
        title: item.title,
        content: item.content ?? "",
        isActionable: item.is_actionable,
        dueDate: item.due_date,
        tags: item.tags,
        status: item.status,
      })),
    );
    await sendWhatsAppText(options.replyTo, reply);
    return true;
  }

  const command = resolved.type === "command" ? resolved.command : parseWhatsAppCommand(raw);
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
