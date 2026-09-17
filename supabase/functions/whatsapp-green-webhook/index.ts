import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  instanceIdFromPayload,
  isGroupWhatsAppChat,
  isPersonalWhatsAppChat,
  normalizeGroupChatId,
  parseGreenApiWebhook,
  personalCaptureChatId,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
  type ParsedGreenApiMessage,
} from "../_shared/green-api.ts";
import { titleFromInboundText, needsVoiceTranscription } from "../_shared/voice-text.ts";
import {
  loadAllowedTagNames,
  parseIncomingMessage,
} from "../_shared/parse-incoming-message.ts";
import {
  findVoiceItemByWhatsAppMessage,
  pendingVoiceItem,
  scheduleBackgroundWork,
  transcribeStoredVoiceItem,
  transcribeVoiceMessage,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "../_shared/voice-ingest.ts";
import { sendGreenApiText } from "../_shared/green-api-send.ts";
import {
  addHoursIso,
  buildCaptureConfirmation,
  buildTaskBriefing,
  buildWhatsAppMenuText,
  builtInMenuQuestions,
  formatClockFromIso,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  parseWhatsAppCommand,
  replyChatId,
  resolveCommandItemId,
  resolveWhatsAppTextIntent,
  tomorrowAtHourIso,
} from "../_shared/whatsapp-intents.ts";
import {
  findSystemQuestionReceipt,
  replyWhatsAppSystemQuestion,
} from "../_shared/whatsapp-system-question-reply.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface UserRow {
  id: string;
  phone: string | null;
  phone_verified: boolean;
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_capture_group_name: string | null;
  whatsapp_last_item_ids?: string[] | null;
  onboarding_completed_at?: string | null;
}

const USER_SELECT_CORE =
  "id,phone,phone_verified,whatsapp_capture_group_chat_id,whatsapp_capture_group_name";
const USER_SELECT = `${USER_SELECT_CORE},whatsapp_last_item_ids,onboarding_completed_at`;

function isMissingSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the (?:table|column)/i.test(message)
  );
}

interface GatewayRow extends VoiceGatewayCredentials {
  user_id: string;
  webhook_token: string | null;
}

async function findVerifiedUser(
  supabase: ReturnType<typeof adminClient>,
  phones: string[],
): Promise<UserRow | null> {
  const variants = new Set<string>();
  for (const phone of phones) {
    if (!phone.trim()) continue;
    try {
      for (const variant of phoneLookupVariants(phone)) {
        variants.add(variant);
      }
    } catch {
      // skip unparseable
    }
  }
  for (const candidate of variants) {
    const full = await supabase
      .from("users")
      .select(USER_SELECT)
      .eq("phone", candidate)
      .maybeSingle();
    const row =
      full.data ??
      (full.error && isMissingSchemaError(full.error)
        ? (
            await supabase
              .from("users")
              .select(USER_SELECT_CORE)
              .eq("phone", candidate)
              .maybeSingle()
          ).data
        : null);
    if (row && (row as UserRow).phone_verified) {
      return row as UserRow;
    }
  }
  return null;
}

async function findUserByCaptureGroup(
  supabase: ReturnType<typeof adminClient>,
  chatId: string,
): Promise<UserRow | null> {
  const trimmed = chatId.trim();
  if (!trimmed.endsWith("@g.us") && !trimmed.endsWith("@c.us")) return null;
  const candidates = [...new Set([trimmed, normalizeGroupChatId(trimmed)])];
  for (const candidate of candidates) {
    const full = await supabase
      .from("users")
      .select(USER_SELECT)
      .eq("whatsapp_capture_group_chat_id", candidate)
      .eq("phone_verified", true)
      .maybeSingle();
    if (full.data) return full.data as UserRow;
    if (full.error && isMissingSchemaError(full.error)) {
      const core = await supabase
        .from("users")
        .select(USER_SELECT_CORE)
        .eq("whatsapp_capture_group_chat_id", candidate)
        .eq("phone_verified", true)
        .maybeSingle();
      if (core.data) return core.data as UserRow;
    }
  }
  return null;
}

async function rememberLastItemIds(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  itemIds: string[],
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ whatsapp_last_item_ids: itemIds.slice(0, 12) })
    .eq("id", userId);
  if (error && !isMissingSchemaError(error)) {
    throw error;
  }
}

type BoardItem = {
  id: string;
  title: string;
  content: string | null;
  due_date: string | null;
  tags: string[] | null;
  status: string | null;
  is_actionable: boolean | null;
};

async function loadOpenBoardItems(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
): Promise<BoardItem[]> {
  const select = "id, title, content, due_date, tags, status, is_actionable";
  const full = await supabase
    .from("mindtasker_items")
    .select(select)
    .eq("user_id", userId)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (!full.error) return (full.data ?? []) as BoardItem[];
  if (!isMissingSchemaError(full.error)) {
    console.error("loadOpenBoardItems", full.error.message);
    return [];
  }
  const fallback = await supabase
    .from("mindtasker_items")
    .select(select)
    .eq("user_id", userId)
    .in("status", ["inbox", "pending"])
    .order("due_date", { ascending: true, nullsFirst: false });
  if (fallback.error) {
    console.error("loadOpenBoardItems fallback", fallback.error.message);
    return [];
  }
  return (fallback.data ?? []) as BoardItem[];
}

async function handleGroupTextIntent(options: {
  supabase: ReturnType<typeof adminClient>;
  user: UserRow;
  gateway: GatewayRow | null;
  message: ParsedGreenApiMessage;
  text: string;
  sourceType?: "whatsapp_text" | "whatsapp_voice";
}): Promise<boolean> {
  const raw = options.text.trim();
  if (resolveWhatsAppTextIntent(raw).type === "skip") return true;

  const replyTo = replyChatId(options.message);
  const allowedTags = await loadAllowedTagNames(options.supabase, options.user.id);
  const resolved = resolveWhatsAppTextIntent(raw, allowedTags);
  if (resolved.type === "ingest") return false;
  const menu = builtInMenuQuestions(allowedTags);

  if (resolved.type === "menu") {
    await sendGreenApiText(options.gateway, replyTo, buildWhatsAppMenuText(menu));
    const { error } = await options.supabase
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", options.user.id)
      .is("onboarding_completed_at", null);
    if (error && !isMissingSchemaError(error)) throw error;
    return true;
  }

  if (resolved.type === "query") {
    const items = await loadOpenBoardItems(options.supabase, options.user.id);
    const tasks = items.filter((item) => item.is_actionable !== false);
    const matched = tasks.filter(
      (item) =>
        itemMatchesBriefingDay(item, resolved.query.day) &&
        itemMatchesQueryTag(item, resolved.query.tag),
    );
    if (matched.length === 0 && resolved.fallbackSearch) {
      await replyWhatsAppSystemQuestion({
        supabase: options.supabase,
        userId: options.user.id,
        chatId: replyTo,
        messageId: options.message.messageId,
        sourceType: options.sourceType ?? "whatsapp_text",
        parsed: { kind: "question", question: resolved.fallbackSearch },
        gateway: options.gateway,
        rawText: raw,
      });
      return true;
    }
    await rememberLastItemIds(
      options.supabase,
      options.user.id,
      matched.map((item) => String(item.id)),
    );
    const inboxCount = tasks.filter((item) => item.status === "inbox").length;
    await sendGreenApiText(
      options.gateway,
      replyTo,
      buildTaskBriefing(matched, resolved.query, { inboxCount }),
    );
    return true;
  }

  if (resolved.type === "search") {
    await replyWhatsAppSystemQuestion({
      supabase: options.supabase,
      userId: options.user.id,
      chatId: replyTo,
      messageId: options.message.messageId,
      sourceType: options.sourceType ?? "whatsapp_text",
      parsed: resolved.parsed,
      gateway: options.gateway,
      rawText: raw,
    });
    return true;
  }

  const command = resolved.type === "command" ? resolved.command : parseWhatsAppCommand(raw);
  if (!command) return false;

  const { data: fresh, error: lastIdsError } = await options.supabase
    .from("users")
    .select("whatsapp_last_item_ids")
    .eq("id", options.user.id)
    .maybeSingle();
  if (lastIdsError && !isMissingSchemaError(lastIdsError)) throw lastIdsError;
  const lastIds = Array.isArray(fresh?.whatsapp_last_item_ids)
    ? fresh.whatsapp_last_item_ids.map(String)
    : Array.isArray(options.user.whatsapp_last_item_ids)
      ? options.user.whatsapp_last_item_ids.map(String)
      : [];
  const itemId = resolveCommandItemId(command, lastIds);
  if (!itemId) {
    await sendGreenApiText(
      options.gateway,
      replyTo,
      "לא מצאתי פריט אחרון. כתבו «תפריט» או בחרו מספר אחרי הקליטה.",
    );
    return true;
  }

  const { data: item } = await options.supabase
    .from("mindtasker_items")
    .select("id, title, due_date, metadata")
    .eq("id", itemId)
    .eq("user_id", options.user.id)
    .maybeSingle();
  if (!item) {
    await sendGreenApiText(options.gateway, replyTo, "הפריט כבר לא זמין. כתבו «תפריט».");
    return true;
  }

  if (command.type === "complete") {
    await options.supabase
      .from("mindtasker_items")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_interacted_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", options.user.id);
    await sendGreenApiText(options.gateway, replyTo, `סומן כבוצע: ${item.title}`);
    return true;
  }

  const due =
    command.type === "snooze"
      ? addHoursIso(command.hours)
      : tomorrowAtHourIso(command.hour);
  await options.supabase
    .from("mindtasker_items")
    .update({ due_date: due, last_interacted_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", options.user.id);
  const label =
    command.type === "snooze"
      ? `נדחה ל-${formatClockFromIso(due)}`
      : `עודכן ל-מחר ${String(command.hour).padStart(2, "0")}:00`;
  await sendGreenApiText(options.gateway, replyTo, `${label}: ${item.title}`);
  return true;
}

async function maybeSendGroupMenu(options: {
  supabase: ReturnType<typeof adminClient>;
  user: UserRow;
  gateway: GatewayRow | null;
  chatId: string;
}): Promise<void> {
  if (!options.chatId.endsWith("@g.us")) return;
  const { data, error } = await options.supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", options.user.id)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) return;
  if (data?.onboarding_completed_at) return;
  const allowedTags = await loadAllowedTagNames(options.supabase, options.user.id);
  await sendGreenApiText(
    options.gateway,
    options.chatId,
    `בקבוצה הזו אפשר לשאול שאלות מובנות — בחרו מספר או כתבו «תפריט» שוב בכל עת.\n\n${buildWhatsAppMenuText(builtInMenuQuestions(allowedTags))}`,
  );
  const { error: onboardError } = await options.supabase
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", options.user.id)
    .is("onboarding_completed_at", null);
  if (onboardError && !isMissingSchemaError(onboardError)) throw onboardError;
}

async function gateCapture(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  chatId: string,
  chatName?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const incoming = normalizeGroupChatId(chatId);
  const configured = user.whatsapp_capture_group_chat_id?.trim() ?? "";
  const configuredName = user.whatsapp_capture_group_name?.trim() ?? "";
  const personalId = personalCaptureChatId(user.phone);

  if (configuredName && chatName?.trim() && configuredName === chatName.trim()) {
    if (configured !== incoming) {
      await supabase
        .from("users")
        .update({
          whatsapp_capture_group_chat_id: incoming,
          whatsapp_capture_group_name: configuredName,
          ...(incoming.toLowerCase().endsWith("@g.us")
            ? { notify_whatsapp_group: true }
            : {}),
        })
        .eq("id", user.id);
    }
    return { allowed: true };
  }

  if (!configured) {
    await supabase
      .from("users")
      .update({
        whatsapp_capture_group_chat_id: incoming,
        whatsapp_capture_group_name: chatName?.trim() || configuredName || null,
        ...(incoming.toLowerCase().endsWith("@g.us")
          ? { notify_whatsapp_group: true }
          : {}),
      })
      .eq("id", user.id);
    return { allowed: true };
  }

  const configuredNorm = normalizeGroupChatId(configured);
  if (configuredNorm === incoming) {
    return { allowed: true };
  }

  if (
    isGroupWhatsAppChat(configuredNorm) &&
    personalId &&
    normalizeGroupChatId(personalId) === incoming
  ) {
    return { allowed: true };
  }

  if (isPersonalWhatsAppChat(configuredNorm) && isGroupWhatsAppChat(incoming)) {
    const name = configuredName;
    const isDefaultPersonal =
      !name ||
      name.includes("הודעה לעצמי") ||
      name.toLowerCase().includes("babitk") ||
      name.toLowerCase().includes("message yourself");
    if (isDefaultPersonal) {
      await supabase
        .from("users")
        .update({
          whatsapp_capture_group_chat_id: incoming,
          whatsapp_capture_group_name: chatName?.trim() || "קבוצת קליטה",
          notify_whatsapp_group: true,
        })
        .eq("id", user.id);
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "wrong_capture_group" };
}

async function alreadyIngested(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  messageId: string,
  gateway: GatewayRow | null,
): Promise<boolean> {
  if (await findSystemQuestionReceipt(supabase, userId, messageId)) {
    return true;
  }
  const existing = await findVoiceItemByWhatsAppMessage(supabase, userId, messageId);
  if (!existing) return false;
  queueVoiceTranscription(supabase, existing, gateway);
  return true;
}

function itemFromMessage(message: ParsedGreenApiMessage): {
  sourceType: "whatsapp_text" | "whatsapp_voice" | "image";
  title: string;
  content: string;
} {
  if (message.type === "image") {
    const content = message.text?.trim() || "תמונה מוואטסאפ";
    return {
      sourceType: "image",
      title: titleFromInboundText(content),
      content,
    };
  }
  const content = message.text?.trim() || "פריט מוואטסאפ";
  return {
    sourceType: "whatsapp_text",
    title: titleFromInboundText(content),
    content,
  };
}

async function voiceItemFromMessage(
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
  supabase: ReturnType<typeof adminClient>,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  try {
    const transcribed = await transcribeVoiceMessage(message, gateway, supabase);
    if (!needsVoiceTranscription(transcribed.title, transcribed.content)) {
      return transcribed;
    }
  } catch (error) {
    console.error("inline whatsapp asr failed", error);
  }
  return pendingVoiceItem(message.audioUrl ?? null);
}

function queueVoiceTranscription(
  supabase: ReturnType<typeof adminClient>,
  row: VoiceItemRow,
  gateway: GatewayRow | null,
): void {
  if (!needsVoiceTranscription(row.title, row.content)) return;
  scheduleBackgroundWork(transcribeStoredVoiceItem(supabase, row, gateway));
}

async function ingestMessage(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
): Promise<{ id: string; title: string } | "answered" | null> {
  if (await alreadyIngested(supabase, user.id, message.messageId, gateway)) {
    return null;
  }
  const item =
    message.type === "audio"
      ? await voiceItemFromMessage(message, gateway, supabase)
      : itemFromMessage(message);
  const questionText = item.content || ("rawText" in item ? item.rawText : "");
  if (
    !needsVoiceTranscription(item.title, item.content) &&
    questionText.trim() &&
    (await handleGroupTextIntent({
      supabase,
      user,
      gateway,
      message,
      text: questionText,
      sourceType: message.type === "audio" ? "whatsapp_voice" : "whatsapp_text",
    }))
  ) {
    return "answered";
  }
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: user.id,
      source_type: item.sourceType,
      raw_text: "rawText" in item ? item.rawText : item.content,
      storage_url:
        message.type === "audio"
          ? ("audioUrl" in item ? item.audioUrl : message.audioUrl) ?? null
          : message.imageUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
        ...(message.type === "audio"
          ? {
              whisper_transcription: "rawText" in item ? item.rawText : item.content,
              corrected_transcription: item.content,
            }
          : {}),
      },
    })
    .select("id")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const allowedTags = await loadAllowedTagNames(supabase, user.id);
  const skipParse = needsVoiceTranscription(item.title, item.content);
  const parsed = skipParse ? undefined : parseIncomingMessage(item.content, allowedTags)[0];

  const { data: inserted, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert({
      user_id: user.id,
      source_material_id: source?.id ?? null,
      title: parsed?.title || item.title,
      content: parsed?.content || item.content,
      is_actionable: parsed?.is_actionable ?? true,
      status: "inbox",
      due_date: parsed?.due_date ?? null,
      tags: parsed?.tags ?? [],
      metadata: {
        source: item.sourceType,
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        ...(message.type === "audio"
          ? {
              whisper_transcription: "rawText" in item ? item.rawText : item.content,
              corrected_transcription: item.content,
            }
          : {}),
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id, user_id, title, content, metadata, source_material_id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }

  if (message.type === "audio") {
    const storageUrl =
      ("audioUrl" in item ? item.audioUrl : message.audioUrl) ?? null;
    queueVoiceTranscription(
      supabase,
      {
        id: inserted.id as string,
        user_id: user.id,
        title: inserted.title as string,
        content: inserted.content as string,
        metadata: (inserted.metadata as Record<string, unknown> | null) ?? null,
        source_material_id: source?.id ?? null,
        source_materials: source?.id
          ? {
              id: source.id,
              storage_url: storageUrl,
              metadata: {
                whatsapp_message_id: message.messageId,
                chat_id: message.chatId,
              },
            }
          : null,
      },
      gateway,
    );
  }
  return { id: inserted.id as string, title: inserted.title as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization, x-webhook-token",
      },
    });
  }
  if (req.method === "GET") {
    return json({
      ok: true,
      provider: "green-api",
      endpoint: "whatsapp-green-webhook",
      method: "POST",
      asr: "inline-whisper-v3",
      qa: "star-v2",
    });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = adminClient();
  const instanceId = instanceIdFromPayload(body);
  let gateway: GatewayRow | null = null;
  if (instanceId) {
    const { data } = await supabase
      .from("whatsapp_gateways")
      .select("user_id,webhook_token,instance_id,api_token,api_url")
      .eq("instance_id", instanceId)
      .maybeSingle();
    gateway = (data as GatewayRow | null) ?? null;
  }

  if (!verifyGreenApiWebhookAuth(req, gateway?.webhook_token ?? undefined)) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const parsed = parseGreenApiWebhook(body);
  if (parsed.ignored) {
    return json({ received: true, ignored: true, reason: parsed.reason ?? "not_inbound" });
  }
  if (parsed.messages.length === 0) {
    return json({
      received: true,
      messages: [],
      note: parsed.reason ?? "no_actionable_content",
    });
  }

  const scheduled: Array<{ messageId: string; userId: string }> = [];
  const answered: Array<{ messageId: string; userId: string }> = [];
  const skipped: Array<{ messageId: string; reason: string }> = [];

  for (const message of parsed.messages) {
    const payload = body as {
      instanceData?: { wid?: string };
      senderData?: { sender?: string };
    };
    const phones = [
      message.senderPhone,
      payload.instanceData?.wid ?? "",
      payload.senderData?.sender ?? "",
    ];
    const user = isGroupWhatsAppChat(message.chatId)
      ? (await findUserByCaptureGroup(supabase, message.chatId)) ??
        (await findVerifiedUser(supabase, phones))
      : (await findVerifiedUser(supabase, phones)) ??
        (await findUserByCaptureGroup(supabase, message.chatId));
    if (!user) {
      skipped.push({ messageId: message.messageId, reason: "not_linked" });
      continue;
    }
    if (!gateway) {
      const { data } = await supabase
        .from("whatsapp_gateways")
        .select("user_id,webhook_token,instance_id,api_token,api_url")
        .eq("user_id", user.id)
        .maybeSingle();
      gateway = (data as GatewayRow | null) ?? null;
    }
    const gate = await gateCapture(supabase, user, message.chatId, message.chatName);
    if (!gate.allowed) {
      skipped.push({
        messageId: message.messageId,
        reason: gate.reason ?? "capture_gated",
      });
      continue;
    }
    try {
      if (message.type === "text" && message.text) {
        const handled = await handleGroupTextIntent({
          supabase,
          user,
          gateway,
          message,
          text: message.text,
        });
        if (handled) {
          answered.push({ messageId: message.messageId, userId: user.id });
          await maybeSendGroupMenu({
            supabase,
            user,
            gateway,
            chatId: message.chatId,
          });
          continue;
        }
      }
      if (message.fromOwner === false) {
        skipped.push({ messageId: message.messageId, reason: "not_owner_capture" });
        continue;
      }
      const inserted = await ingestMessage(supabase, user, message, gateway);
      if (inserted === "answered") {
        answered.push({ messageId: message.messageId, userId: user.id });
      } else if (inserted) {
        await rememberLastItemIds(supabase, user.id, [inserted.id]);
        await sendGreenApiText(
          gateway,
          replyChatId(message),
          buildCaptureConfirmation([{ title: inserted.title }]),
        );
        await maybeSendGroupMenu({
          supabase,
          user,
          gateway,
          chatId: message.chatId,
        });
        scheduled.push({
          messageId: message.messageId,
          userId: user.id,
        });
      }
    } catch (error) {
      skipped.push({
        messageId: message.messageId,
        reason: error instanceof Error ? error.message : "ingest_failed",
      });
    }
  }

  return json({
    received: true,
    provider: "green-api",
    scheduled,
    answered,
    skipped,
  });
});
