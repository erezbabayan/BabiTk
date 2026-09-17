import { createClient } from "npm:@supabase/supabase-js@2";

import {
  answerWhatsAppSystemQuestion,
  parseWhatsAppSystemQuestion,
  type SystemQuestionItem,
  type SystemQuestionParse,
} from "./whatsapp-system-question.ts";
import { sendGreenApiText } from "./green-api-send.ts";

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
    .select("title, content, is_actionable, due_date, tags, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["inbox", "pending"])
    .order("due_date", { ascending: true })
    .limit(80);
  const rows =
    error && /deleted_at|does not exist|Could not find the (?:table|column)/i.test(error.message)
      ? (
          await supabase
            .from("mindtasker_items")
            .select("title, content, is_actionable, due_date, tags, status")
            .eq("user_id", userId)
            .in("status", ["inbox", "pending"])
            .order("due_date", { ascending: true })
            .limit(80)
        ).data
      : error
        ? null
        : data;
  if (!rows) return [];
  return rows.map((row) => ({
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    isActionable: row.is_actionable === true,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : [],
    status: typeof row.status === "string" ? row.status : "pending",
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
  return parseWhatsAppSystemQuestion(text);
}
