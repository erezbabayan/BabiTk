import { createClient } from "npm:@supabase/supabase-js@2";

import {
  answerWhatsAppSystemQuestion,
  normalizeSpokenWhatsAppQuestion,
  parseWhatsAppVoiceQuestion,
  type SystemQuestionItem,
  type SystemQuestionParse,
} from "./whatsapp-system-question.ts";
import { sendGreenApiText } from "./green-api-send.ts";
import {
  buildTaskBriefing,
  buildWhatsAppMenuText,
  builtInMenuQuestions,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  isWhatsAppMenuRequest,
  parseWhatsAppQuery,
  type WhatsAppQuery,
} from "./whatsapp-intents.ts";
import { loadAllowedTagNames } from "./parse-incoming-message.ts";

type AdminClient = ReturnType<typeof createClient>;

export type SystemQuestionGateway = {
  instance_id: string;
  api_token: string;
  api_url?: string | null;
};

export async function loadOpenItemsForSystemQuestion(
  supabase: AdminClient,
  userId: string,
): Promise<SystemQuestionItem[]> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("title, content, is_actionable, due_date, tags, status, metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["inbox", "pending"])
    .order("due_date", { ascending: true })
    .limit(80);
  if (error || !data) return [];
  return data.map((row) => ({
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    isActionable: row.is_actionable === true,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : [],
    status: typeof row.status === "string" ? row.status : "pending",
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  }));
}

export async function findSystemQuestionReceipt(
  supabase: AdminClient,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("source_materials")
    .select("id")
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId)
    .filter("metadata->>system_question", "eq", "true")
    .limit(1);
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

export async function recordSystemQuestionReceipt(
  supabase: AdminClient,
  params: {
    userId: string;
    messageId: string;
    chatId: string;
    text: string;
    sourceType: "whatsapp_text" | "whatsapp_voice";
  },
): Promise<void> {
  await supabase.from("source_materials").insert({
    user_id: params.userId,
    source_type: params.sourceType,
    raw_text: params.text,
    metadata: {
      whatsapp_message_id: params.messageId,
      chat_id: params.chatId,
      channel: "whatsapp",
      system_question: true,
    },
  });
}

export async function rememberWhatsAppLastItemIds(
  supabase: AdminClient,
  userId: string,
  itemIds: string[],
): Promise<void> {
  if (!userId.trim() || itemIds.length === 0) return;
  const { error } = await supabase
    .from("users")
    .update({ whatsapp_last_item_ids: itemIds.slice(0, 12) })
    .eq("id", userId);
  if (!error) return;
  const message = error.message ?? "";
  if (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the (?:table|column)/i.test(message)
  ) {
    return;
  }
  console.error("remember last whatsapp items failed", error);
}

async function loadOpenActionableItems(
  supabase: AdminClient,
  userId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    content: string;
    due_date: string | null;
    tags: string[] | null;
    status: string;
    is_actionable: boolean;
  }>
> {
  const { data } = await supabase
    .from("mindtasker_items")
    .select("id, title, content, due_date, tags, status, is_actionable")
    .eq("user_id", userId)
    .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(80);
  return (data ?? []) as Array<{
    id: string;
    title: string;
    content: string;
    due_date: string | null;
    tags: string[] | null;
    status: string;
    is_actionable: boolean;
  }>;
}

export async function replyWhatsAppCannedQuery(params: {
  supabase: AdminClient;
  userId: string;
  chatId: string;
  messageId: string;
  sourceType: "whatsapp_text" | "whatsapp_voice";
  gateway: SystemQuestionGateway | null;
  rawText: string;
  query: WhatsAppQuery;
}): Promise<boolean> {
  const items = await loadOpenActionableItems(params.supabase, params.userId);
  const matched = items.filter(
    (item) =>
      itemMatchesBriefingDay(item, params.query.day) &&
      itemMatchesQueryTag(item, params.query.tag),
  );
  await rememberWhatsAppLastItemIds(
    params.supabase,
    params.userId,
    matched.map((item) => String(item.id)),
  );
  const sent = await sendGreenApiText(
    params.gateway,
    params.chatId,
    buildTaskBriefing(matched, params.query),
  );
  if (sent) {
    await recordSystemQuestionReceipt(params.supabase, {
      userId: params.userId,
      messageId: params.messageId,
      chatId: params.chatId,
      text: params.rawText,
      sourceType: params.sourceType,
    });
  }
  return true;
}

export async function replyWhatsAppSystemQuestion(params: {
  supabase: AdminClient;
  userId: string;
  chatId: string;
  messageId: string;
  sourceType: "whatsapp_text" | "whatsapp_voice";
  parsed: SystemQuestionParse;
  gateway: SystemQuestionGateway | null;
  rawText: string;
}): Promise<boolean> {
  if (params.parsed.kind === "none") return false;
  const items = await loadOpenItemsForSystemQuestion(params.supabase, params.userId);
  const message = answerWhatsAppSystemQuestion(params.parsed, items);
  const sent = await sendGreenApiText(params.gateway, params.chatId, message);
  if (sent) {
    await recordSystemQuestionReceipt(params.supabase, {
      userId: params.userId,
      messageId: params.messageId,
      chatId: params.chatId,
      text: params.rawText,
      sourceType: params.sourceType,
    });
  }
  return true;
}

export function parseIfSystemQuestion(text: string): SystemQuestionParse {
  return parseWhatsAppVoiceQuestion(text);
}

export async function resolveCaptureChatId(
  supabase: AdminClient,
  userId: string,
  fallbackChatId = "",
): Promise<string> {
  if (fallbackChatId.trim()) return fallbackChatId.trim();
  const { data } = await supabase
    .from("users")
    .select("whatsapp_capture_group_chat_id")
    .eq("id", userId)
    .maybeSingle();
  return typeof data?.whatsapp_capture_group_chat_id === "string"
    ? data.whatsapp_capture_group_chat_id
    : "";
}

/**
 * After ASR, a recorded question must be answered in the capture group and
 * must not stay as a task/note. Prefixed «בבי» questions still use canned
 * briefings («משימות באיחור», «התאריך עבר») before free-text search.
 */
export async function interceptRecordedWhatsAppTranscript(params: {
  supabase: AdminClient;
  userId: string;
  chatId: string;
  messageId: string;
  sourceType: "whatsapp_text" | "whatsapp_voice";
  gateway: SystemQuestionGateway | null;
  rawText: string;
}): Promise<boolean> {
  const raw = params.rawText.trim();
  if (!raw) return false;
  const spoken = normalizeSpokenWhatsAppQuestion(raw);
  const allowedTags = await loadAllowedTagNames(params.supabase, params.userId);
  const parsed = parseWhatsAppVoiceQuestion(raw);
  const intentText =
    parsed.kind === "question" ? parsed.question : spoken || raw;
  const prefixed = parsed.kind !== "none";

  const chatId = await resolveCaptureChatId(params.supabase, params.userId, params.chatId);

  if (
    parsed.kind === "help" ||
    isWhatsAppMenuRequest(intentText) ||
    isWhatsAppMenuRequest(raw) ||
    isWhatsAppMenuRequest(spoken)
  ) {
    const sent = await sendGreenApiText(
      params.gateway,
      chatId,
      buildWhatsAppMenuText(builtInMenuQuestions(allowedTags)),
    );
    if (sent) {
      await recordSystemQuestionReceipt(params.supabase, {
        userId: params.userId,
        messageId: params.messageId,
        chatId,
        text: raw,
        sourceType: params.sourceType,
      });
    }
    return true;
  }

  const query = parseWhatsAppQuery(intentText, allowedTags);
  if (query) {
    await replyWhatsAppCannedQuery({
      supabase: params.supabase,
      userId: params.userId,
      chatId,
      messageId: params.messageId,
      sourceType: params.sourceType,
      gateway: params.gateway,
      rawText: raw,
      query,
    });
    return true;
  }

  if (!prefixed) return false;

  await replyWhatsAppSystemQuestion({
    supabase: params.supabase,
    userId: params.userId,
    chatId,
    messageId: params.messageId,
    sourceType: params.sourceType,
    parsed,
    gateway: params.gateway,
    rawText: raw,
  });
  return true;
}
