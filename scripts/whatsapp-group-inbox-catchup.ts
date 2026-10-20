#!/usr/bin/env node
/**
 * Bind the WhatsApp capture @g.us id and copy recent group texts into מחברת.
 * Runs from GitHub Actions with SUPABASE_SERVICE_ROLE_KEY (no Edge Function deploy).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node --experimental-strip-types scripts/whatsapp-group-inbox-catchup.ts
 */
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
} from "../supabase/functions/_shared/green-api-chats.ts";

const SUPABASE_URL = (
  process.env.SUPABASE_URL?.trim() ||
  "https://ghibfuinantybqidwadj.supabase.co"
).replace(/\/$/, "");
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const CATCHUP_MAX_INSERTS = 40;
const EXISTING_ID_LIMIT = 500;

type GatewayRow = {
  user_id: string;
  instance_id: string;
  api_token: string;
  api_url: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_capture_group_name: string | null;
};

type CatchupSummary = {
  userId: string;
  email: string | null;
  boundChatId: string | null;
  scanned: number;
  inserted: number;
  error?: string;
};

async function supabaseRest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 120) || "משימה מוואטסאפ";
}

function asCreds(gateway: GatewayRow): GreenApiCreds {
  return {
    instanceId: gateway.instance_id,
    apiToken: gateway.api_token,
    apiUrl: gateway.api_url ?? undefined,
  };
}

async function existingWhatsAppMessageIds(userId: string): Promise<Set<string>> {
  const rows = (await supabaseRest(
    `mindtasker_items?user_id=eq.${userId}&select=metadata&order=created_at.desc&limit=${EXISTING_ID_LIMIT}`,
  )) as Array<{ metadata?: unknown }>;
  const ids = new Set<string>();
  for (const row of rows ?? []) {
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

async function bindCaptureGroup(
  user: UserRow,
  creds: GreenApiCreds,
  journal: GreenApiJournalText[],
): Promise<string | null> {
  const existing = parseGroupChatId(user.whatsapp_capture_group_chat_id ?? "");
  if (existing) return existing;
  const savedName = user.whatsapp_capture_group_name?.trim() ?? "";
  if (savedName && !isPersonalCaptureLabel(savedName)) {
    try {
      const groups = await fetchGreenApiGroups(creds);
      const matched = pickMatchingGroup(groups, savedName);
      if (matched?.chatId.endsWith("@g.us")) {
        await supabaseRest(`users?id=eq.${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            whatsapp_capture_group_chat_id: matched.chatId,
            whatsapp_capture_group_name: matched.name,
            notify_whatsapp_group: true,
          }),
        });
        return matched.chatId;
      }
    } catch (error) {
      console.warn("list groups failed", user.id, error);
    }
    const fromJournal = pickMatchingGroup(
      journal.map((row) => ({
        chatId: row.chatId,
        name: row.chatName || row.chatId,
      })),
      savedName,
    );
    if (fromJournal?.chatId.endsWith("@g.us")) {
      await supabaseRest(`users?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          whatsapp_capture_group_chat_id: fromJournal.chatId,
          whatsapp_capture_group_name: fromJournal.name,
          notify_whatsapp_group: true,
        }),
      });
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
    await supabaseRest(`users?id=eq.${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        whatsapp_capture_group_chat_id: outgoingGroups[0],
        whatsapp_capture_group_name: named,
        notify_whatsapp_group: true,
      }),
    });
    return outgoingGroups[0];
  }
  return null;
}

async function insertCatchupTexts(
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
    status: "inbox",
    due_date: null,
    tags: [],
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
  await supabaseRest("mindtasker_items", {
    method: "POST",
    body: JSON.stringify(rows),
  });
  return messages.length;
}

async function catchUpUser(
  gateway: GatewayRow,
  user: UserRow,
): Promise<CatchupSummary> {
  const creds = asCreds(gateway);
  const journal = await fetchGreenApiJournalTexts(creds, 10080);
  const boundChatId = await bindCaptureGroup(user, creds, journal);
  const history = boundChatId
    ? await fetchGreenApiChatHistoryTexts(creds, boundChatId, 80)
    : [];
  const selected = selectCatchupMessages(
    [...journal, ...history],
    boundChatId,
    Math.floor(Date.now() / 1000),
  );
  const known = await existingWhatsAppMessageIds(user.id);
  const fresh = selected
    .filter((row) => !known.has(row.messageId))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, CATCHUP_MAX_INSERTS);
  const inserted = await insertCatchupTexts(user.id, fresh);
  return {
    userId: user.id,
    email: user.email,
    boundChatId,
    scanned: selected.length,
    inserted,
  };
}

async function main(): Promise<void> {
  if (!SERVICE_ROLE) {
    console.log(
      "Skipping — add GitHub secret SUPABASE_SERVICE_ROLE_KEY to pull WhatsApp group tasks into inbox.",
    );
    return;
  }
  const gateways = (await supabaseRest(
    "whatsapp_gateways?select=user_id,instance_id,api_token,api_url&instance_id=not.is.null",
  )) as GatewayRow[];
  if (!Array.isArray(gateways) || gateways.length === 0) {
    console.log("No WhatsApp gateways found.");
    return;
  }
  const summaries: CatchupSummary[] = [];
  for (const gateway of gateways) {
    if (!gateway.instance_id?.trim() || (gateway.api_token ?? "").trim().length < 8) {
      continue;
    }
    const users = (await supabaseRest(
      `users?id=eq.${gateway.user_id}&select=id,email,whatsapp_capture_group_chat_id,whatsapp_capture_group_name&phone_verified=eq.true`,
    )) as UserRow[];
    const user = users[0];
    if (!user) continue;
    try {
      const summary = await catchUpUser(gateway, user);
      summaries.push(summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      const failed: CatchupSummary = {
        userId: user.id,
        email: user.email,
        boundChatId: parseGroupChatId(user.whatsapp_capture_group_chat_id ?? ""),
        scanned: 0,
        inserted: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      summaries.push(failed);
      console.error(JSON.stringify(failed));
    }
  }
  const inserted = summaries.reduce((sum, row) => sum + row.inserted, 0);
  const errors = summaries.filter((row) => row.error).length;
  console.log(
    JSON.stringify({
      users: summaries.length,
      inserted,
      errors,
    }),
  );
  if (errors > 0 && inserted === 0) {
    process.exitCode = 1;
  }
}

await main();
