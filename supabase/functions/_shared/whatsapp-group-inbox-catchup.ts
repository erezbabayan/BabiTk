/**
 * Pull recent WhatsApp capture-group texts into מחברת (inbox).
 * Used by whatsapp-green-connect so the browser does not need Green-API CORS.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchGreenApiChatHistoryTexts,
  fetchGreenApiGroups,
  fetchGreenApiJournalTexts,
  isPersonalCaptureLabel,
  parseGroupChatId,
  pickMatchingGroup,
  selectCatchupMessages,
  type GreenApiCreds,
  type GreenApiJournalText,
} from "./green-api-chats.ts";

type AdminClient = ReturnType<typeof createClient>;

export type CatchupGateway = {
  instance_id: string;
  api_token: string;
  api_url?: string | null;
};

export type GroupInboxCatchupResult = {
  ok: true;
  catchup: true;
  boundChatId: string | null;
  scanned: number;
  inserted: number;
};

const CATCHUP_MAX_INSERTS = 40;
const HISTORY_COUNT = 80;
const EXISTING_ID_LIMIT = 500;

function asCreds(gateway: CatchupGateway): GreenApiCreds {
  return {
    instanceId: gateway.instance_id,
    apiToken: gateway.api_token,
    apiUrl: gateway.api_url ?? undefined,
  };
}

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 120) || "משימה מוואטסאפ";
}

async function loadCapture(
  admin: AdminClient,
  userId: string,
): Promise<{ chatId: string | null; name: string }> {
  const { data } = await admin
    .from("users")
    .select("whatsapp_capture_group_chat_id, whatsapp_capture_group_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    chatId: parseGroupChatId(
      typeof data?.whatsapp_capture_group_chat_id === "string"
        ? data.whatsapp_capture_group_chat_id
        : "",
    ),
    name:
      typeof data?.whatsapp_capture_group_name === "string"
        ? data.whatsapp_capture_group_name.trim()
        : "",
  };
}

async function saveCapture(
  admin: AdminClient,
  userId: string,
  chatId: string,
  name: string,
): Promise<void> {
  const { error } = await admin
    .from("users")
    .update({
      whatsapp_capture_group_chat_id: chatId,
      whatsapp_capture_group_name: name || chatId,
      notify_whatsapp_group: true,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message || "שמירת קבוצת הקליטה נכשלה");
}

async function bindCaptureGroup(
  admin: AdminClient,
  userId: string,
  creds: GreenApiCreds,
  journal: GreenApiJournalText[],
): Promise<string | null> {
  const current = await loadCapture(admin, userId);
  if (current.chatId) return current.chatId;

  const savedName = current.name;
  if (savedName && !isPersonalCaptureLabel(savedName)) {
    try {
      const groups = await fetchGreenApiGroups(creds);
      const matched = pickMatchingGroup(groups, savedName);
      if (matched?.chatId.endsWith("@g.us")) {
        await saveCapture(admin, userId, matched.chatId, matched.name);
        return matched.chatId;
      }
    } catch {
      // fall through to journal names
    }
    const fromJournal = pickMatchingGroup(
      journal.map((row) => ({
        chatId: row.chatId,
        name: row.chatName || row.chatId,
      })),
      savedName,
    );
    if (fromJournal?.chatId.endsWith("@g.us")) {
      await saveCapture(admin, userId, fromJournal.chatId, fromJournal.name);
      return fromJournal.chatId;
    }
  }

  const outgoingGroups = [
    ...new Set(journal.filter((row) => row.outgoing).map((row) => row.chatId)),
  ];
  if (outgoingGroups.length === 1 && outgoingGroups[0]) {
    const named =
      journal.find((row) => row.chatId === outgoingGroups[0])?.chatName ??
      savedName ??
      outgoingGroups[0];
    await saveCapture(admin, userId, outgoingGroups[0], named);
    return outgoingGroups[0];
  }
  return null;
}

async function existingWhatsAppMessageIds(
  admin: AdminClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("mindtasker_items")
    .select("metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(EXISTING_ID_LIMIT);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const id =
      metadata && typeof metadata.whatsapp_message_id === "string"
        ? metadata.whatsapp_message_id.trim()
        : "";
    if (id) ids.add(id);
  }
  return ids;
}

async function insertCatchupTexts(
  admin: AdminClient,
  userId: string,
  messages: GreenApiJournalText[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const now = Date.now();
  const rows = messages.map((message, index) => ({
    user_id: userId,
    title: titleFromText(message.text),
    content: message.text,
    is_actionable: true,
    status: "inbox" as const,
    due_date: null,
    tags: [] as string[],
    metadata: {
      source: "whatsapp_text",
      whatsapp_message_id: message.messageId,
      chat_id: message.chatId,
      channel: "whatsapp",
      catchup: true,
    },
    sort_order: now + index * 10,
    last_interacted_at: new Date(now).toISOString(),
  }));
  const { error } = await admin.from("mindtasker_items").insert(rows);
  if (error) throw new Error(error.message || "שמירת משימות מהקבוצה נכשלה");
  return messages.length;
}

export async function runWhatsAppGroupInboxCatchup(
  admin: AdminClient,
  userId: string,
  gateway: CatchupGateway,
): Promise<GroupInboxCatchupResult> {
  const creds = asCreds(gateway);
  const journal = await fetchGreenApiJournalTexts(creds, 10080);
  const boundChatId = await bindCaptureGroup(admin, userId, creds, journal);
  const history = boundChatId
    ? await fetchGreenApiChatHistoryTexts(creds, boundChatId, HISTORY_COUNT)
    : [];
  const selected = selectCatchupMessages(
    [...journal, ...history],
    boundChatId,
    Math.floor(Date.now() / 1000),
  );
  const known = await existingWhatsAppMessageIds(admin, userId);
  const fresh = selected
    .filter((row) => !known.has(row.messageId))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, CATCHUP_MAX_INSERTS);
  const inserted = await insertCatchupTexts(admin, userId, fresh);
  return {
    ok: true,
    catchup: true,
    boundChatId,
    scanned: selected.length,
    inserted,
  };
}
