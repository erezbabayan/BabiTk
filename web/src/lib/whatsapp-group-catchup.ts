import {
  fetchGreenApiChatHistoryTexts,
  fetchGreenApiJournalTexts,
  isPersonalCaptureLabel,
  parseGroupChatId,
  pickMatchingGroup,
  selectCatchupMessages,
  type GreenApiJournalText,
} from "../../../supabase/functions/_shared/green-api-chats.ts";
import {
  clientTimezone,
  parseIncomingMessage,
  parsedItemInsertFields,
  resolveAllowedTagNames,
} from "./parse-incoming-message";
import { requireSupabase } from "./supabase";
import {
  getCloudUserProfile,
  updateCloudUserProfile,
} from "./user-profile";
import {
  listCaptureGroups,
  loadGreenApiGateway,
  resolveCaptureGroup,
} from "./whatsapp-capture-groups";
import { currentAccessToken, currentUserId } from "./whatsapp-gateway";

const CATCHUP_MAX_INSERTS = 25;

export type WhatsAppCatchupResult = {
  boundChatId: string | null;
  scanned: number;
  inserted: number;
};

let catchupInFlight: Promise<WhatsAppCatchupResult> | null = null;

async function bindCaptureGroupIfNeeded(): Promise<string | null> {
  const profile = await getCloudUserProfile();
  const existing = parseGroupChatId(profile.whatsapp_capture_group_chat_id ?? "");
  if (existing) return existing;
  const savedName = profile.whatsapp_capture_group_name?.trim() ?? "";
  if (savedName && !isPersonalCaptureLabel(savedName)) {
    try {
      const matched = await resolveCaptureGroup(savedName);
      if (matched.chatId.endsWith("@g.us")) {
        await updateCloudUserProfile({
          whatsapp_capture_group_name: matched.name,
          whatsapp_capture_group_chat_id: matched.chatId,
          notify_whatsapp_group: true,
        });
        return matched.chatId;
      }
    } catch {
      // fall through to journal-based bind
    }
  }
  const groups = await listCaptureGroups().catch(() => []);
  if (savedName && !isPersonalCaptureLabel(savedName)) {
    const matched = pickMatchingGroup(groups, savedName);
    if (matched?.chatId.endsWith("@g.us")) {
      await updateCloudUserProfile({
        whatsapp_capture_group_name: matched.name,
        whatsapp_capture_group_chat_id: matched.chatId,
        notify_whatsapp_group: true,
      });
      return matched.chatId;
    }
  }
  return null;
}

async function existingWhatsAppMessageIds(userId: string): Promise<Set<string>> {
  const supabase = requireSupabase();
  const { data } = await supabase
    .from("mindtasker_items")
    .select("metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);
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

async function loadAllowedTagNames(userId: string): Promise<string[]> {
  try {
    const supabase = requireSupabase();
    const { data } = await supabase
      .from("user_tags")
      .select("name")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return resolveAllowedTagNames(
      (data ?? []).map((row) => (typeof row.name === "string" ? row.name : "")),
    );
  } catch {
    return resolveAllowedTagNames([]);
  }
}

async function insertCatchupTexts(
  userId: string,
  messages: GreenApiJournalText[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const supabase = requireSupabase();
  const allowedTags = await loadAllowedTagNames(userId);
  const now = Date.now();
  const rows: Array<{
    user_id: string;
    title: string;
    content: string;
    is_actionable: boolean;
    status: "inbox";
    due_date: string | null;
    tags: string[];
    metadata: Record<string, unknown>;
    sort_order: number;
    last_interacted_at: string;
  }> = [];
  for (const [index, message] of messages.entries()) {
    const extraMeta = {
      source: "whatsapp_text",
      whatsapp_message_id: message.messageId,
      chat_id: message.chatId,
      channel: "whatsapp",
      catchup: true,
    };
    const parsed = parseIncomingMessage(message.text, {
      allowedTags,
      timezone: clientTimezone(),
    });
    if (parsed.length === 0) {
      rows.push({
        user_id: userId,
        title: message.text.slice(0, 120),
        content: message.text,
        is_actionable: true,
        status: "inbox",
        due_date: null,
        tags: [],
        metadata: extraMeta,
        sort_order: now + index * 10,
        last_interacted_at: new Date(now).toISOString(),
      });
      continue;
    }
    for (const [part, item] of parsed.entries()) {
      const fields = parsedItemInsertFields(
        item,
        extraMeta,
        new Date(now + index * 10 + part),
      );
      rows.push({
        user_id: userId,
        title: fields.title,
        content: fields.content,
        is_actionable: fields.is_actionable,
        status: "inbox",
        due_date: fields.due_date,
        tags: fields.tags,
        metadata: fields.metadata,
        sort_order: now + index * 10 + part,
        last_interacted_at: new Date(now).toISOString(),
      });
    }
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("mindtasker_items").insert(rows);
  if (error) throw new Error(error.message || "שמירת משימות מהקבוצה נכשלה");
  return messages.length;
}

async function catchUpViaConnect(): Promise<WhatsAppCatchupResult | null> {
  const accessToken = await currentAccessToken();
  if (!accessToken) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-green-connect", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "catchupInbox" },
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as {
    catchup?: unknown;
    boundChatId?: unknown;
    scanned?: unknown;
    inserted?: unknown;
  };
  if (row.catchup !== true) return null;
  return {
    boundChatId: typeof row.boundChatId === "string" ? row.boundChatId : null,
    scanned: typeof row.scanned === "number" ? row.scanned : 0,
    inserted: typeof row.inserted === "number" ? row.inserted : 0,
  };
}

async function catchUpWhatsAppGroupInboxOnce(): Promise<WhatsAppCatchupResult> {
  const empty: WhatsAppCatchupResult = {
    boundChatId: null,
    scanned: 0,
    inserted: 0,
  };
  const viaConnect = await catchUpViaConnect();
  if (viaConnect) return viaConnect;
  const userId = await currentUserId();
  const gateway = await loadGreenApiGateway();
  if (!userId || !gateway) return empty;

  let boundChatId = await bindCaptureGroupIfNeeded();
  const journal = await fetchGreenApiJournalTexts(gateway, 10080);
  if (!boundChatId) {
    const outgoingGroups = [
      ...new Set(journal.filter((row) => row.outgoing).map((row) => row.chatId)),
    ];
    if (outgoingGroups.length === 1 && outgoingGroups[0]) {
      const named =
        journal.find((row) => row.chatId === outgoingGroups[0])?.chatName ??
        outgoingGroups[0];
      await updateCloudUserProfile({
        whatsapp_capture_group_name: named,
        whatsapp_capture_group_chat_id: outgoingGroups[0],
        notify_whatsapp_group: true,
      });
      boundChatId = outgoingGroups[0];
    }
  }

  const history = boundChatId
    ? await fetchGreenApiChatHistoryTexts(gateway, boundChatId, 80)
    : [];
  const selected = selectCatchupMessages(
    [...journal, ...history],
    boundChatId,
    Math.floor(Date.now() / 1000),
  );
  const known = await existingWhatsAppMessageIds(userId);
  const fresh = selected
    .filter((row) => !known.has(row.messageId))
    .slice(0, CATCHUP_MAX_INSERTS);
  const inserted = await insertCatchupTexts(userId, fresh);
  return {
    boundChatId,
    scanned: selected.length,
    inserted,
  };
}

export async function catchUpWhatsAppGroupInbox(): Promise<WhatsAppCatchupResult> {
  if (catchupInFlight) return await catchupInFlight;
  catchupInFlight = catchUpWhatsAppGroupInboxOnce().finally(() => {
    catchupInFlight = null;
  });
  return await catchupInFlight;
}
