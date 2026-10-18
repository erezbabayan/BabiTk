import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  instanceIdFromPayload,
  isGroupWhatsAppChat,
  isWhatsAppLidId,
  parseGreenApiWebhook,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
  type ParsedGreenApiMessage,
} from "../_shared/green-api.ts";
import {
  titleFromInboundText,
  isInsertableInboundText,
  needsVoiceTranscription,
  needsOcrTranscription,
} from "../_shared/voice-text.ts";
import {
  finishWhatsAppImageItem,
  insertPendingWhatsAppImageItem,
} from "../_shared/notebook-ingest.ts";
import { isVisionOcrConfigured } from "../_shared/notebook-ocr.ts";
import {
  loadAllowedTagNames,
  parseIncomingMessage,
} from "../_shared/parse-incoming-message.ts";
import {
  applyVoiceTranscription,
  findVoiceItemByWhatsAppMessage,
  ensureWhatsAppMessageId,
  isSoftDeletedVoiceItem,
  isStableWhatsAppMessageId,
  isWhatsAppMessageCaptured,
  insertPendingWhatsAppVoiceItem,
  interceptVoiceItemQuestion,
  repairOnePlaceholderVoiceItem,
  scheduleBackgroundWork,
  softDeleteVoiceItemAsQuestion,
  transcribeStoredVoiceItem,
  transcribeVoiceMessageWithRetry,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "../_shared/voice-ingest.ts";
import { catchUpCaptureVoice } from "../_shared/whatsapp-history-catchup.ts";
import { sendGreenApiText } from "../_shared/green-api-send.ts";
import {
  addHoursIso,
  buildCaptureConfirmation,
  buildTaskBriefing,
  buildWhatsAppMenuText,
  builtInMenuQuestions,
  formatClockFromIso,
  isSystemWhatsAppReply,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  parseMenuSelection,
  parseWhatsAppCommand,
  parseWhatsAppQuery,
  replyChatId,
  resolveCommandItemId,
  tomorrowAtHourIso,
} from "../_shared/whatsapp-intents.ts";
import { classifyWhatsAppInbound } from "../_shared/whatsapp-inbound-route.ts";
import {
  findSystemQuestionReceipt,
  replyWhatsAppSystemQuestion,
} from "../_shared/whatsapp-system-question-reply.ts";
import { evaluateCaptureGate } from "../_shared/capture-gate.ts";
import { parseInboundText, type IngestSourceType, layoutMetadataFromParsed } from "../_shared/inbound-item.ts";
import { queueCalendarSync } from "../_shared/google-calendar.ts";

const ASR_FAIL_REPLY =
  "לא הצלחתי לתמלל את ההקלטה. כתבו את השאלה בטקסט, למשל: בבי מה המשימות היום";
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
  const full = await supabase
    .from("users")
    .select(USER_SELECT)
    .eq("whatsapp_capture_group_chat_id", trimmed)
    .eq("phone_verified", true)
    .maybeSingle();
  if (full.data) return full.data as UserRow;
  if (!full.error || !isMissingSchemaError(full.error)) {
    return (full.data as UserRow | null) ?? null;
  }
  const core = await supabase
    .from("users")
    .select(USER_SELECT_CORE)
    .eq("whatsapp_capture_group_chat_id", trimmed)
    .eq("phone_verified", true)
    .maybeSingle();
  return (core.data as UserRow | null) ?? null;
}

async function findUserById(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
): Promise<UserRow | null> {
  const trimmed = userId.trim();
  if (!trimmed) return null;
  const full = await supabase
    .from("users")
    .select(USER_SELECT)
    .eq("id", trimmed)
    .maybeSingle();
  if (full.data) return full.data as UserRow;
  if (!full.error || !isMissingSchemaError(full.error)) {
    return (full.data as UserRow | null) ?? null;
  }
  const core = await supabase
    .from("users")
    .select(USER_SELECT_CORE)
    .eq("id", trimmed)
    .maybeSingle();
  return (core.data as UserRow | null) ?? null;
}

function phonesForUserLookup(message: ParsedGreenApiMessage, body: unknown): string[] {
  const payload = body as {
    instanceData?: { wid?: string };
    senderData?: { sender?: string };
  };
  const candidates = [
    message.senderPhone,
    payload.instanceData?.wid ?? "",
    payload.senderData?.sender ?? "",
  ];
  return candidates.filter((phone) => {
    const trimmed = phone.trim();
    if (!trimmed) return false;
    return !isWhatsAppLidId(trimmed);
  });
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

async function handleGroupTextIntent(options: {
  supabase: ReturnType<typeof adminClient>;
  user: UserRow;
  gateway: GatewayRow | null;
  message: ParsedGreenApiMessage;
  text: string;
  sourceType?: "whatsapp_text" | "whatsapp_voice";
}): Promise<boolean> {
  const raw = options.text.trim();
  if (!raw || isSystemWhatsAppReply(raw)) return true;
  const route = classifyWhatsAppInbound(raw);
  if (route.lane === "capture") return false;

  const replyTo = replyChatId(options.message);

  if (route.lane === "command") {
    const command = parseWhatsAppCommand(raw);
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
    queueCalendarSync(options.supabase, options.user.id, itemId);
    const label =
      command.type === "snooze"
        ? `נדחה ל-${formatClockFromIso(due)}`
        : `עודכן ל-מחר ${String(command.hour).padStart(2, "0")}:00`;
    await sendGreenApiText(options.gateway, replyTo, `${label}: ${item.title}`);
    return true;
  }

  const allowedTags = await loadAllowedTagNames(options.supabase, options.user.id);
  const menu = builtInMenuQuestions(allowedTags);

  if (route.lane === "help" || route.lane === "menu") {
    await sendGreenApiText(options.gateway, replyTo, buildWhatsAppMenuText(menu));
    const { error } = await options.supabase
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", options.user.id)
      .is("onboarding_completed_at", null);
    if (error && !isMissingSchemaError(error)) throw error;
    return true;
  }

  const query =
    route.lane === "menu_pick"
      ? parseMenuSelection(raw, menu)
      : parseWhatsAppQuery(route.question, allowedTags);
  if (query) {
    const { data } = await options.supabase
      .from("mindtasker_items")
      .select("id, title, content, due_date, tags, status, is_actionable")
      .eq("user_id", options.user.id)
      .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(80);
    const matched = (data ?? []).filter(
      (item) =>
        itemMatchesBriefingDay(item, query.day) && itemMatchesQueryTag(item, query.tag),
    );
    await rememberLastItemIds(
      options.supabase,
      options.user.id,
      matched.map((item) => String(item.id)),
    );
    await sendGreenApiText(options.gateway, replyTo, buildTaskBriefing(matched, query));
    return true;
  }

  if (route.lane === "question") {
    await replyWhatsAppSystemQuestion({
      supabase: options.supabase,
      userId: options.user.id,
      chatId: replyTo,
      messageId: options.message.messageId,
      sourceType: options.sourceType ?? "whatsapp_text",
      parsed: { kind: "question", question: route.question },
      gateway: options.gateway,
      rawText: raw,
    });
    return true;
  }

  return false;
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
  const decision = evaluateCaptureGate(
    {
      phone: user.phone,
      captureGroupChatId: user.whatsapp_capture_group_chat_id,
      captureGroupName: user.whatsapp_capture_group_name,
    },
    chatId,
    chatName,
  );
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }
  if (decision.bind) {
    await supabase
      .from("users")
      .update({
        whatsapp_capture_group_chat_id: decision.bind.chatId,
        whatsapp_capture_group_name: decision.bind.name,
        ...(isGroupWhatsAppChat(decision.bind.chatId)
          ? { notify_whatsapp_group: true }
          : {}),
      })
      .eq("id", user.id);
    user.whatsapp_capture_group_chat_id = decision.bind.chatId;
    user.whatsapp_capture_group_name = decision.bind.name;
  }
  return { allowed: true };
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
  if (!isStableWhatsAppMessageId(messageId)) {
    return false;
  }
  const existing = await findVoiceItemByWhatsAppMessage(supabase, userId, messageId);
  if (!existing) {
    return await isWhatsAppMessageCaptured(supabase, userId, messageId);
  }
  if (isSoftDeletedVoiceItem(existing)) return true;
  if (needsVoiceTranscription(existing.title, existing.content)) {
    scheduleBackgroundWork(
      transcribeStoredVoiceItem(supabase, existing, gateway).then(() => undefined),
    );
  } else if (needsOcrTranscription(existing.title, existing.content)) {
    scheduleBackgroundWork(
      finishWhatsAppImageItem(supabase, existing, gateway).then(() => undefined),
    );
  }
  return true;
}

function itemFromMessage(message: ParsedGreenApiMessage): {
  sourceType: "whatsapp_text" | "whatsapp_voice" | "image";
  title: string;
  content: string;
} | null {
  if (message.type === "image") {
    const content = message.text?.trim() ?? "";
    if (!isInsertableInboundText(titleFromInboundText(content), content)) {
      return null;
    }
    return {
      sourceType: "image",
      title: titleFromInboundText(content),
      content,
    };
  }
  const content = message.text?.trim() ?? "";
  if (!isInsertableInboundText(titleFromInboundText(content), content)) {
    return null;
  }
  return {
    sourceType: "whatsapp_text",
    title: titleFromInboundText(content),
    content,
  };
}

async function finishWhatsAppVoiceItem(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
  pending: VoiceItemRow,
): Promise<void> {
  try {
    const transcribed = await transcribeVoiceMessageWithRetry(message, gateway, supabase);
    if (!isInsertableInboundText(transcribed.title, transcribed.content)) {
      return;
    }
    if (await interceptVoiceItemQuestion(supabase, pending, transcribed, gateway)) {
      return;
    }
    const questionText = transcribed.content || transcribed.rawText;
    if (
      questionText.trim() &&
      (await handleGroupTextIntent({
        supabase,
        user,
        gateway,
        message,
        text: questionText,
        sourceType: "whatsapp_voice",
      }))
    ) {
      await softDeleteVoiceItemAsQuestion(supabase, pending, transcribed);
      return;
    }
    await applyVoiceTranscription(supabase, pending, transcribed);
    await rememberLastItemIds(supabase, user.id, [pending.id]);
    await sendGreenApiText(
      gateway,
      replyChatId(message),
      buildCaptureConfirmation([{ title: transcribed.title }]),
    );
  } catch (error) {
    console.error("background whatsapp asr failed", error);
  }
}

async function ingestMessage(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
): Promise<{ id: string; title: string } | "answered" | null> {
  message.messageId = ensureWhatsAppMessageId(message.messageId);
  if (await alreadyIngested(supabase, user.id, message.messageId, gateway)) {
    return null;
  }
  if (message.type === "audio") {
    let pending;
    try {
      pending = await insertPendingWhatsAppVoiceItem(supabase, user.id, message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail === "whatsapp_message_already_captured") {
        return null;
      }
      console.error("pending voice insert failed", error);
      await sendGreenApiText(gateway, replyChatId(message), ASR_FAIL_REPLY);
      return "answered";
    }
    if (isSoftDeletedVoiceItem(pending)) return null;
    scheduleBackgroundWork(
      finishWhatsAppVoiceItem(supabase, user, message, gateway, pending),
    );
    return { id: pending.id, title: pending.title };
  }

  if (message.type === "image") {
    const caption = message.text?.trim() ?? "";
    if (!isVisionOcrConfigured() && caption) {
      return await insertCapturedItem(supabase, user, message, {
        sourceType: "image",
        title: titleFromInboundText(caption),
        content: caption,
      });
    }
    let pending;
    try {
      pending = await insertPendingWhatsAppImageItem(supabase, user.id, message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail === "whatsapp_message_already_captured") {
        return null;
      }
      console.error("pending image insert failed", error);
      return null;
    }
    if (isSoftDeletedVoiceItem(pending)) return null;
    // OCR runs in a separate isolate (`ocr_image`). waitUntil in this
    // isolate is killed before Gemini returns and used to mark the row failed.
    return { id: pending.id, title: pending.title };
  }

  const item = itemFromMessage(message);
  if (!item) {
    return null;
  }
  const questionText = item.content;
  if (
    questionText.trim() &&
    (await handleGroupTextIntent({
      supabase,
      user,
      gateway,
      message,
      text: questionText,
      sourceType: "whatsapp_text",
    }))
  ) {
    return "answered";
  }
  return await insertCapturedItem(supabase, user, message, item);
}

async function insertCapturedItem(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  message: ParsedGreenApiMessage,
  item: {
    sourceType: "whatsapp_text" | "whatsapp_voice" | "image";
    title: string;
    content: string;
    rawText?: string;
    audioUrl?: string | null;
  },
): Promise<{ id: string; title: string } | null> {
  if (!isInsertableInboundText(item.title, item.content)) {
    throw new Error("inbound_text_required");
  }
  if (await isWhatsAppMessageCaptured(supabase, user.id, message.messageId)) {
    return null;
  }
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: user.id,
      source_type: item.sourceType,
      raw_text: item.rawText ?? item.content,
      storage_url:
        message.type === "audio"
          ? item.audioUrl ?? message.audioUrl ?? null
          : message.imageUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
        ...(message.type === "audio"
          ? {
              whisper_transcription: item.rawText ?? item.content,
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

  const sourceType = item.sourceType as IngestSourceType;
  let parsedRows: ReturnType<typeof parseInboundText> = [];
  if (item.content.trim()) {
    try {
      parsedRows = parseInboundText(item.content, {
        sourceType,
        fallbackTitle: item.title,
      });
    } catch (error) {
      console.error("inbound parse failed, falling back", error);
    }
  }
  if (parsedRows.length === 0) {
    const allowedTags = await loadAllowedTagNames(supabase, user.id);
    parsedRows = parseIncomingMessage(item.content, allowedTags).map((row) => ({
      title: row.title,
      content: row.content,
      is_actionable: row.is_actionable,
      tags: row.tags,
      due_date: row.due_date,
      analysis: undefined as ReturnType<typeof parseInboundText>[number]["analysis"],
      reminder_recurrence: undefined as ReturnType<typeof parseInboundText>[number]["reminder_recurrence"],
      checklist: undefined as ReturnType<typeof parseInboundText>[number]["checklist"],
    }));
  }
  const rows =
    parsedRows.length > 0
      ? parsedRows
      : [
          {
            title: item.title,
            content: item.content,
            is_actionable: true,
            tags: [] as string[],
            due_date: null as string | null,
            analysis: undefined as unknown,
            reminder_recurrence: null,
            checklist: undefined,
          },
        ];

  const voiceMeta =
    message.type === "audio"
      ? {
          whisper_transcription: item.rawText ?? item.content,
          corrected_transcription: item.content,
        }
      : {};

  const { data: insertedRows, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert(
      rows.map((row, index) => ({
        user_id: user.id,
        source_material_id: source?.id ?? null,
        title: row.title,
        content: row.content,
        is_actionable: row.is_actionable,
        status: "inbox",
        tags: row.tags,
        due_date: row.due_date,
        metadata: {
          source: sourceType,
          analysis: row.analysis,
          whatsapp_message_id: message.messageId,
          chat_id: message.chatId,
          ...layoutMetadataFromParsed(row),
          ...voiceMeta,
        },
        sort_order: now + index,
        last_interacted_at: new Date(now).toISOString(),
      })),
    )
    .select("id, title");
  if (itemError || !insertedRows?.[0]) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }
  for (const row of insertedRows) {
    queueCalendarSync(supabase, user.id, String(row.id));
  }
  const inserted = insertedRows[0];
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
      asr: "inline-whisper-v11",
      ocr: "notebook-v2",
      qa: "babi-v5",
      layout: "task-v1",
      engines: {
        gemini: Boolean(Deno.env.get("GEMINI_API_KEY")?.trim()),
        groq: Boolean(Deno.env.get("GROQ_API_KEY")?.trim()),
        openai: Boolean(Deno.env.get("OPENAI_API_KEY")?.trim()),
        vision: isVisionOcrConfigured(),
        runpod: Boolean(
          Deno.env.get("RUNPOD_API_KEY")?.trim() && Deno.env.get("RUNPOD_ENDPOINT_ID")?.trim(),
        ),
        gradio: true,
      },
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
  const action =
    body && typeof body === "object" && "action" in body && typeof (body as { action?: unknown }).action === "string"
      ? (body as { action: string }).action
      : "";
  if (action === "catchup_voice" || action === "catchup_image") {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    const payload = body as { userId?: unknown; instanceId?: unknown };
    const instanceId =
      typeof payload.instanceId === "string" ? payload.instanceId.trim() : "";
    const payloadUserId =
      typeof payload.userId === "string" ? payload.userId.trim() : "";
    let gatewayQuery = supabase
      .from("whatsapp_gateways")
      .select("user_id,instance_id,api_token,api_url,webhook_token");
    if (instanceId) {
      gatewayQuery = gatewayQuery.eq("instance_id", instanceId);
    } else if (payloadUserId) {
      gatewayQuery = gatewayQuery.eq("user_id", payloadUserId);
    } else {
      return json({ error: "gateway_missing" }, 400);
    }
    const { data: gatewayRow } = await gatewayQuery.maybeSingle();
    const allowed = [SERVICE_ROLE, gatewayRow?.webhook_token].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (!token || !allowed.includes(token)) {
      return json({ error: "invalid_webhook_token" }, 401);
    }
    if (!gatewayRow?.user_id) {
      return json({ error: "gateway_missing" }, 503);
    }
    const result = await catchUpCaptureVoice({
      supabase,
      userId: String(gatewayRow.user_id),
      gateway: {
        instance_id: String(gatewayRow.instance_id),
        api_token: String(gatewayRow.api_token),
        api_url: String(gatewayRow.api_url),
        user_id: String(gatewayRow.user_id),
      },
      transcribe: true,
      count: 15,
    });
    return json({ ok: true, ...result });
  }
  if (action === "ocr_image") {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    const payload = body as {
      userId?: unknown;
      messageId?: unknown;
      chatId?: unknown;
      imageUrl?: unknown;
      mimeType?: unknown;
      caption?: unknown;
    };
    const { data: gatewayRow } = await supabase
      .from("whatsapp_gateways")
      .select("user_id,instance_id,api_token,api_url,webhook_token")
      .limit(1)
      .maybeSingle();
    const allowed = [SERVICE_ROLE, gatewayRow?.webhook_token].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (!token || !allowed.includes(token)) {
      return json({ error: "invalid_webhook_token" }, 401);
    }
    const userId =
      typeof payload.userId === "string" && payload.userId.trim()
        ? payload.userId.trim()
        : String(gatewayRow?.user_id ?? "");
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!userId || !messageId) {
      return json({ error: "missing_ocr_target" }, 400);
    }
    const pending = await findVoiceItemByWhatsAppMessage(supabase, userId, messageId);
    if (!pending) {
      return json({ ok: false, reason: "item_not_found" });
    }
    if (isSoftDeletedVoiceItem(pending)) {
      return json({ ok: true, skipped: "deleted" });
    }
    const message: ParsedGreenApiMessage = {
      messageId,
      senderId: "",
      senderPhone: "",
      chatId: typeof payload.chatId === "string" ? payload.chatId : String(pending.metadata?.chat_id ?? ""),
      direction: "outgoing",
      type: "image",
      imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl : undefined,
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "image/jpeg",
      caption: typeof payload.caption === "string" ? payload.caption : undefined,
      text: typeof payload.caption === "string" ? payload.caption : undefined,
    };
    const ocrGateway: GatewayRow | null = gatewayRow
      ? {
          user_id: String(gatewayRow.user_id),
          webhook_token: gatewayRow.webhook_token,
          instance_id: String(gatewayRow.instance_id),
          api_token: String(gatewayRow.api_token),
          api_url: String(gatewayRow.api_url),
        }
      : null;
    const result = await finishWhatsAppImageItem(supabase, pending, ocrGateway, message);
    const title = result?.title ?? pending.title;
    if (result && !needsOcrTranscription(title, result.content)) {
      await rememberLastItemIds(supabase, userId, [pending.id]);
      await sendGreenApiText(
        ocrGateway,
        replyChatId(message),
        buildCaptureConfirmation([{ title }]),
      );
    }
    return json({ ok: Boolean(result), title });
  }
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
  if (!gateway) {
    const { data } = await supabase
      .from("whatsapp_gateways")
      .select("user_id,webhook_token,instance_id,api_token,api_url")
      .limit(1)
      .maybeSingle();
    gateway = (data as GatewayRow | null) ?? null;
  }

  if (!verifyGreenApiWebhookAuth(req, gateway?.webhook_token ?? undefined)) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const parsed = parseGreenApiWebhook(body);
  const kickVoiceCatchup = () => {
    const secret = SERVICE_ROLE || gateway?.webhook_token;
    if (!secret) return;
    scheduleBackgroundWork(
      fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/whatsapp-green-webhook`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "catchup_voice",
          userId: gateway.user_id,
          instanceId: gateway.instance_id,
        }),
        signal: AbortSignal.timeout(90_000),
      }).then(async (response) => {
        await response.text();
      }),
    );
  };
  const kickImageOcr = (message: ParsedGreenApiMessage, userId: string) => {
    const secret = SERVICE_ROLE || gateway?.webhook_token;
    if (!secret) return;
    scheduleBackgroundWork(
      fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/whatsapp-green-webhook`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "ocr_image",
          userId,
          messageId: message.messageId,
          chatId: message.chatId,
          imageUrl: message.imageUrl ?? null,
          mimeType: message.mimeType ?? "image/jpeg",
          caption: message.caption ?? message.text ?? null,
        }),
        signal: AbortSignal.timeout(90_000),
      }).then(async (response) => {
        await response.text();
      }),
    );
  };
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
    const user =
      (await findVerifiedUser(supabase, phonesForUserLookup(message, body))) ??
      (await findUserByCaptureGroup(supabase, message.chatId)) ??
      (gateway?.user_id ? await findUserById(supabase, gateway.user_id) : null);
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
          await repairOnePlaceholderVoiceItem(supabase, user.id, gateway);
          continue;
        }
      }
      const inserted = await ingestMessage(supabase, user, message, gateway);
      if (inserted === "answered") {
        answered.push({ messageId: message.messageId, userId: user.id });
      } else if (
        inserted &&
        !needsVoiceTranscription(inserted.title, inserted.content) &&
        !needsOcrTranscription(inserted.title, inserted.content)
      ) {
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
      } else if (inserted) {
        if (message.type === "image") {
          kickImageOcr(message, user.id);
        }
        scheduled.push({
          messageId: message.messageId,
          userId: user.id,
        });
      }
      if (message.type !== "audio") {
        await repairOnePlaceholderVoiceItem(supabase, user.id, gateway);
      }
    } catch (error) {
      skipped.push({
        messageId: message.messageId,
        reason: error instanceof Error ? error.message : "ingest_failed",
      });
    }
  }

  if (!parsed.messages.some((message) => message.type === "audio")) {
    kickVoiceCatchup();
  }

  return json({
    received: true,
    provider: "green-api",
    scheduled,
    answered,
    skipped,
  });
});
