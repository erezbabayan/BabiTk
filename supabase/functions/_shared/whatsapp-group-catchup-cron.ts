/**
 * Scheduled WhatsApp capture-group catch-up (pg_cron every 10 min). NEW messages only.
 *
 * The live webhook stays the primary path. This only recovers capture-group texts
 * the webhook never handled, and only ones newer than the user's watermark
 * (users.whatsapp_group_catchup_since). Nothing at or before the watermark is
 * ever imported; a message with an unknown timestamp is skipped.
 *
 * Dedupe, keyed by Green-API message id:
 *  - skip ids in whatsapp_inbound_seen (webhook marks every message it handled),
 *  - skip ids already on mindtasker_items / source_materials (incl. soft-deleted),
 *  - claim via INSERT .. ON CONFLICT DO NOTHING on whatsapp_inbound_seen; insert
 *    the item only when the claim row came back,
 *  - ignore messages younger than GRACE_SECONDS so the webhook gets them first.
 * Never sends WhatsApp messages and never binds a capture group.
 */

import { parseGroupChatId, shouldCatchupCaptureText, type GreenApiCreds, type GreenApiJournalText } from "./green-api-chats.ts";

export const GROUP_CATCHUP_CRON_LEASE = "whatsapp-group-catchup";
export const GROUP_CATCHUP_CRON_LEASE_TTL_SECONDS = 300;
export const GROUP_CATCHUP_GRACE_SECONDS = 180;
export const GROUP_CATCHUP_MAX_LOOKBACK_MINUTES = 48 * 60;
export const GROUP_CATCHUP_MAX_INSERTS = 40;

type QueryError = { message?: string; code?: string } | null;
// deno-lint-ignore no-explicit-any
type AnyAdmin = { from: (table: string) => any };

export type CatchupFetchers = {
  journal: (creds: GreenApiCreds, minutes: number) => Promise<GreenApiJournalText[]>;
  history: (creds: GreenApiCreds, chatId: string, count: number) => Promise<GreenApiJournalText[]>;
};

export type GroupCatchupUserResult = {
  userId: string;
  watermark: string | null;
  scanned: number;
  candidates: number;
  duplicates: number;
  inserted: number;
  wouldInsert?: number;
  initializedWatermark?: boolean;
  error?: string;
};

export type GroupCatchupRunResult = {
  ok: true;
  dryRun: boolean;
  users: number;
  scanned: number;
  inserted: number;
  wouldInsert: number;
  duplicates: number;
  errors: number;
  details: GroupCatchupUserResult[];
};

/** Pure: which journal/history rows are new capture-group texts eligible for import. */
export function selectNewGroupMessages(
  rows: GreenApiJournalText[],
  options: { chatId: string; sinceSec: number; nowSec: number; graceSec?: number },
): GreenApiJournalText[] {
  const chatId = parseGroupChatId(options.chatId);
  if (!chatId || !Number.isFinite(options.sinceSec) || options.sinceSec <= 0) return [];
  const newest = options.nowSec - (options.graceSec ?? GROUP_CATCHUP_GRACE_SECONDS);
  const seen = new Set<string>();
  const out: GreenApiJournalText[] = [];
  for (const row of rows) {
    if (!row.messageId || seen.has(row.messageId)) continue;
    if (row.chatId !== chatId) continue;
    if (!(row.timestamp > options.sinceSec)) continue; // unknown (0) or at/before watermark
    if (row.timestamp > newest) continue; // webhook grace window
    if (!shouldCatchupCaptureText(row.text)) continue;
    seen.add(row.messageId);
    out.push(row);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function catchupLookbackMinutes(sinceSec: number, nowSec: number): number {
  const minutes = Math.ceil(Math.max(0, nowSec - sinceSec) / 60) + 10;
  return Math.min(GROUP_CATCHUP_MAX_LOOKBACK_MINUTES, Math.max(15, minutes));
}

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 120) || "משימה מוואטסאפ";
}

async function hasRow(query: PromiseLike<{ data: unknown; error: QueryError }>): Promise<boolean> {
  const { data, error } = await query;
  if (error) throw new Error(error.message || "dedupe lookup failed");
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

/** True when this Green-API message id was already handled for the user (any path). */
export async function isGroupMessageKnown(admin: AnyAdmin, userId: string, messageId: string): Promise<boolean> {
  if (
    await hasRow(
      admin.from("whatsapp_inbound_seen").select("message_id").eq("user_id", userId).eq("message_id", messageId).limit(1),
    )
  ) return true;
  if (
    await hasRow(
      admin.from("mindtasker_items").select("id").eq("user_id", userId)
        .filter("metadata->>whatsapp_message_id", "eq", messageId).limit(1),
    )
  ) return true;
  return await hasRow(
    admin.from("source_materials").select("id").eq("user_id", userId)
      .filter("metadata->>whatsapp_message_id", "eq", messageId).limit(1),
  );
}

/** Atomic claim; true only for the single caller whose row was inserted. */
export async function claimGroupMessage(admin: AnyAdmin, userId: string, messageId: string, via: string): Promise<boolean> {
  const { data, error } = await admin
    .from("whatsapp_inbound_seen")
    .upsert({ user_id: userId, message_id: messageId, via }, { onConflict: "user_id,message_id", ignoreDuplicates: true })
    .select("message_id");
  if (error) throw new Error(error.message || "claim failed");
  return Array.isArray(data) && data.length > 0;
}

/** Webhook side: remember a handled message id. Never throws. */
export async function markWhatsAppInboundSeen(admin: AnyAdmin, userId: string, messageId: string): Promise<void> {
  if (!userId || !messageId) return;
  try {
    await admin
      .from("whatsapp_inbound_seen")
      .upsert({ user_id: userId, message_id: messageId, via: "webhook" }, { onConflict: "user_id,message_id", ignoreDuplicates: true });
  } catch {
    // ledger is best effort; items/source_materials dedupe still applies
  }
}

type EligibleUser = { id: string; chatId: string; since: string | null; creds: GreenApiCreds };

async function loadEligibleUsers(admin: AnyAdmin): Promise<EligibleUser[]> {
  const { data: gateways, error } = await admin
    .from("whatsapp_gateways")
    .select("user_id,instance_id,api_token,api_url")
    .not("instance_id", "is", null);
  if (error) throw new Error(error.message || "gateways lookup failed");
  const out: EligibleUser[] = [];
  for (const gateway of (gateways ?? []) as Array<Record<string, unknown>>) {
    const instanceId = typeof gateway.instance_id === "string" ? gateway.instance_id.trim() : "";
    const apiToken = typeof gateway.api_token === "string" ? gateway.api_token.trim() : "";
    if (!instanceId || apiToken.length < 8 || typeof gateway.user_id !== "string") continue;
    const { data: user, error: userError } = await admin
      .from("users")
      .select("id,whatsapp_capture_group_chat_id,whatsapp_group_catchup_since")
      .eq("id", gateway.user_id)
      .eq("phone_verified", true)
      .maybeSingle();
    if (userError) throw new Error(userError.message || "user lookup failed");
    const chatId = parseGroupChatId(typeof user?.whatsapp_capture_group_chat_id === "string" ? user.whatsapp_capture_group_chat_id : "");
    if (!user || !chatId) continue;
    out.push({
      id: String(user.id),
      chatId,
      since: typeof user.whatsapp_group_catchup_since === "string" ? user.whatsapp_group_catchup_since : null,
      creds: {
        instanceId,
        apiToken,
        apiUrl: typeof gateway.api_url === "string" ? gateway.api_url : undefined,
      },
    });
  }
  return out;
}

async function catchUpOne(
  admin: AnyAdmin,
  user: EligibleUser,
  fetchers: CatchupFetchers,
  nowMs: number,
  dryRun: boolean,
): Promise<GroupCatchupUserResult> {
  const result: GroupCatchupUserResult = {
    userId: user.id,
    watermark: user.since,
    scanned: 0,
    candidates: 0,
    duplicates: 0,
    inserted: 0,
  };
  if (!user.since) {
    // First time this user is seen: start the watermark now, import nothing.
    if (!dryRun) {
      const iso = new Date(nowMs).toISOString();
      await admin.from("users").update({ whatsapp_group_catchup_since: iso }).eq("id", user.id).is("whatsapp_group_catchup_since", null);
      result.watermark = iso;
      result.initializedWatermark = true;
    }
    return result;
  }
  const sinceSec = Math.floor(Date.parse(user.since) / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  if (!Number.isFinite(sinceSec) || sinceSec <= 0) return result;
  if (nowSec - GROUP_CATCHUP_GRACE_SECONDS <= sinceSec) return result; // nothing can be eligible yet
  const minutes = catchupLookbackMinutes(sinceSec, nowSec);
  const rows = [
    ...(await fetchers.journal(user.creds, minutes)),
    ...(await fetchers.history(user.creds, user.chatId, 80)),
  ];
  result.scanned = rows.length;
  const selected = selectNewGroupMessages(rows, { chatId: user.chatId, sinceSec, nowSec });
  result.candidates = selected.length;
  const fresh: GreenApiJournalText[] = [];
  for (const message of selected) {
    if (fresh.length >= GROUP_CATCHUP_MAX_INSERTS) break;
    if (await isGroupMessageKnown(admin, user.id, message.messageId)) {
      result.duplicates += 1;
      continue;
    }
    if (dryRun) {
      fresh.push(message);
      continue;
    }
    if (!(await claimGroupMessage(admin, user.id, message.messageId, "catchup"))) {
      result.duplicates += 1;
      continue;
    }
    fresh.push(message);
  }
  if (dryRun) {
    result.wouldInsert = fresh.length;
    return result;
  }
  if (fresh.length === 0) return result;
  const rowsToInsert = fresh.map((message, index) => ({
    user_id: user.id,
    title: titleFromText(message.text),
    content: message.text,
    is_actionable: true,
    status: "inbox",
    due_date: null,
    tags: [] as string[],
    metadata: {
      source: "whatsapp_text",
      whatsapp_message_id: message.messageId,
      chat_id: message.chatId,
      channel: "whatsapp",
      catchup: true,
      catchup_via: "pg_cron",
    },
    sort_order: nowMs + index * 10,
    last_interacted_at: new Date(nowMs).toISOString(),
  }));
  const { error } = await admin.from("mindtasker_items").insert(rowsToInsert);
  if (error) {
    // Release claims so the next run can retry these ids.
    await admin.from("whatsapp_inbound_seen").delete().eq("user_id", user.id).eq("via", "catchup")
      .in("message_id", fresh.map((message) => message.messageId));
    throw new Error(error.message || "insert failed");
  }
  result.inserted = fresh.length;
  return result;
}

export async function runScheduledGroupCatchup(
  admin: AnyAdmin,
  fetchers: CatchupFetchers,
  options: { dryRun?: boolean; nowMs?: number } = {},
): Promise<GroupCatchupRunResult> {
  const dryRun = options.dryRun === true;
  const nowMs = options.nowMs ?? Date.now();
  const users = await loadEligibleUsers(admin);
  const details: GroupCatchupUserResult[] = [];
  for (const user of users) {
    try {
      details.push(await catchUpOne(admin, user, fetchers, nowMs, dryRun));
    } catch (error) {
      details.push({
        userId: user.id,
        watermark: user.since,
        scanned: 0,
        candidates: 0,
        duplicates: 0,
        inserted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    ok: true,
    dryRun,
    users: details.length,
    scanned: details.reduce((sum, row) => sum + row.scanned, 0),
    inserted: details.reduce((sum, row) => sum + row.inserted, 0),
    wouldInsert: details.reduce((sum, row) => sum + (row.wouldInsert ?? 0), 0),
    duplicates: details.reduce((sum, row) => sum + row.duplicates, 0),
    errors: details.filter((row) => row.error).length,
    details,
  };
}
