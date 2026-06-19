import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  nluTaskPayloadSchema,
  type NluTaskIntegrationResult,
  type NluTaskPayload,
} from "../types/nlu-task.js";
import type { DbMindtaskerItem } from "../types/database.js";
import { createSourceMaterial, findInboxUserByPhone } from "./items.service.js";
import { syncTaskToCalendar } from "./calendar.service.js";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export class NluTaskServiceError extends Error {
  readonly code: "user_not_found" | "user_inactive" | "invalid_date" | "database_error";

  constructor(
    code: "user_not_found" | "user_inactive" | "invalid_date" | "database_error",
    message: string,
  ) {
    super(message);
    this.name = "NluTaskServiceError";
    this.code = code;
  }
}

export function parseNluTaskPayload(input: unknown): NluTaskPayload {
  return nluTaskPayloadSchema.parse(input);
}

/**
 * Validates reminder_datetime or applies default (next 24 hours in user timezone).
 */
export function resolveReminderDatetime(
  reminderDatetime: string | undefined,
  options?: { timezone?: string; referenceDate?: Date },
): string {
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const referenceDate = options?.referenceDate ?? new Date();

  if (reminderDatetime) {
    const parsed = parseIsoDatetime(reminderDatetime);
    if (!parsed) {
      throw new NluTaskServiceError("invalid_date", `Invalid reminder_datetime: ${reminderDatetime}`);
    }
    return parsed.toISOString();
  }

  const fallback = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
  return toTimezoneIso(fallback, timezone);
}

function parseIsoDatetime(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toTimezoneIso(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const offset = formatTimezoneOffset(date, timezone);
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}

function formatTimezoneOffset(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tz = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+00:00";
  const sign = match[1];
  const hours = match[2]?.padStart(2, "0") ?? "00";
  const minutes = match[3] ?? "00";
  return `${sign}${hours}:${minutes}`;
}

export function buildTaskCreatedConfirmation(
  taskTitle: string,
  dueDateIso: string,
  options?: { timezone?: string; referenceDate?: Date },
): string {
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const referenceDate = options?.referenceDate ?? new Date();
  const due = new Date(dueDateIso);
  const whenLabel = formatRelativeDueLabel(due, referenceDate, timezone);
  const shortTitle = taskTitle.length > 40 ? `${taskTitle.slice(0, 37)}...` : taskTitle;
  return `המשימה '${shortTitle}' נוצרה בהצלחה ${whenLabel}!`;
}

function formatRelativeDueLabel(due: Date, reference: Date, timezone: string): string {
  const dueDay = startOfDayInTimezone(due, timezone);
  const refDay = startOfDayInTimezone(reference, timezone);
  const diffDays = Math.round((dueDay - refDay) / 86_400_000);

  const time = due.toLocaleTimeString("he-IL", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (diffDays === 0) return `היום ב-${time}`;
  if (diffDays === 1) return `מחר ב-${time}`;
  if (diffDays === 2) return `מחרתיים ב-${time}`;

  const dateLabel = due.toLocaleDateString("he-IL", {
    timeZone: timezone,
    day: "numeric",
    month: "numeric",
  });
  return `ב-${dateLabel} ב-${time}`;
}

function startOfDayInTimezone(date: Date, timezone: string): number {
  const day = date.toLocaleDateString("en-CA", { timeZone: timezone });
  return new Date(`${day}T00:00:00`).getTime();
}

function normalizeTags(context: string[]): string[] {
  const unique = [...new Set(context.map((tag) => tag.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.slice(0, 3) : ["כללי"];
}

async function assertActiveUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, phone_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new NluTaskServiceError("database_error", `Database lookup failed: ${error.message}`);
  }

  if (!data) {
    throw new NluTaskServiceError("user_not_found", "User not found");
  }
}

export interface CreateNluTaskParams {
  userId: string;
  payload: NluTaskPayload;
  sourceType?: "whatsapp_voice" | "whatsapp_text";
  storageUrl?: string | null;
  metadata?: Record<string, unknown>;
  timezone?: string;
  referenceDate?: Date;
}

export async function createTaskFromNluPayload(
  params: CreateNluTaskParams,
): Promise<{ item: DbMindtaskerItem; responseText: string }> {
  const timezone = params.timezone ?? DEFAULT_TIMEZONE;
  const referenceDate = params.referenceDate ?? new Date();

  await assertActiveUser(params.userId);

  const dueDate = resolveReminderDatetime(params.payload.reminder_datetime, {
    timezone,
    referenceDate,
  });
  const tags = normalizeTags(params.payload.context);

  let sourceMaterial;
  try {
    sourceMaterial = await createSourceMaterial({
      userId: params.userId,
      sourceType: params.sourceType ?? "whatsapp_voice",
      rawText: params.payload.original_transcription,
      storageUrl: params.storageUrl ?? null,
      metadata: {
        channel: "nlu",
        ...params.metadata,
      },
    });
  } catch (error) {
    throw new NluTaskServiceError(
      "database_error",
      error instanceof Error ? error.message : "Failed to save source material",
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .insert({
      user_id: params.userId,
      source_material_id: sourceMaterial.id,
      title: params.payload.task,
      content: "",
      is_actionable: true,
      status: "inbox",
      due_date: dueDate,
      tags,
      metadata: {
        nlu: true,
        notes: params.payload.original_transcription,
        original_transcription: params.payload.original_transcription,
      },
    })
    .select()
    .single();

  if (error || !data) {
    throw new NluTaskServiceError(
      "database_error",
      error?.message ?? "Failed to create task",
    );
  }

  const item = data as DbMindtaskerItem;
  if (item.due_date) {
    await syncTaskToCalendar({
      userId: item.user_id,
      itemId: item.id,
      title: item.title,
      content: item.content,
      dueDate: item.due_date,
      existingEventId: item.calendar_event_id,
    }).catch(() => undefined);
  }

  const responseText = buildTaskCreatedConfirmation(params.payload.task, dueDate, {
    timezone,
    referenceDate,
  });

  return { item, responseText };
}

export async function createTaskFromNluForWhatsAppSender(
  senderPhone: string,
  payload: NluTaskPayload,
  options?: {
    storageUrl?: string | null;
    metadata?: Record<string, unknown>;
    timezone?: string;
    referenceDate?: Date;
  },
): Promise<{ item: DbMindtaskerItem; responseText: string; userId: string }> {
  let user;
  try {
    user = await findInboxUserByPhone(senderPhone);
  } catch (error) {
    throw new NluTaskServiceError(
      "database_error",
      error instanceof Error ? error.message : "Database connection failed",
    );
  }

  if (!user) {
    throw new NluTaskServiceError(
      "user_not_found",
      "No verified MindTasker user linked to this WhatsApp number",
    );
  }

  const result = await createTaskFromNluPayload({
    userId: user.id,
    payload,
    sourceType: "whatsapp_voice",
    storageUrl: options?.storageUrl,
    metadata: {
      whatsapp_sender: senderPhone,
      ...options?.metadata,
    },
    timezone: options?.timezone,
    referenceDate: options?.referenceDate,
  });

  return { ...result, userId: user.id };
}

export function integrateNluTaskPayload(
  input: unknown,
): { ok: true; payload: NluTaskPayload } | { ok: false; code: "validation_error"; message: string } {
  const parsed = nluTaskPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_error",
      message: parsed.error.errors.map((e) => e.message).join("; "),
    };
  }
  return { ok: true, payload: parsed.data };
}

export async function integrateNluTaskForWhatsAppSender(
  senderPhone: string,
  input: unknown,
  options?: {
    storageUrl?: string | null;
    metadata?: Record<string, unknown>;
    timezone?: string;
    referenceDate?: Date;
  },
): Promise<NluTaskIntegrationResult> {
  const parsed = integrateNluTaskPayload(input);
  if (!parsed.ok) {
    return { success: false, code: parsed.code, message: parsed.message };
  }

  try {
    const { item, responseText } = await createTaskFromNluForWhatsAppSender(
      senderPhone,
      parsed.payload,
      options,
    );
    return {
      success: true,
      itemId: item.id,
      responseText,
      title: item.title,
      dueDate: item.due_date ?? "",
    };
  } catch (error) {
    if (error instanceof NluTaskServiceError) {
      return { success: false, code: error.code, message: error.message };
    }
    return {
      success: false,
      code: "database_error",
      message: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

export async function integrateNluTaskForUser(
  userId: string,
  input: unknown,
  options?: Omit<CreateNluTaskParams, "userId" | "payload">,
): Promise<NluTaskIntegrationResult> {
  const parsed = integrateNluTaskPayload(input);
  if (!parsed.ok) {
    return { success: false, code: parsed.code, message: parsed.message };
  }

  try {
    const { item, responseText } = await createTaskFromNluPayload({
      userId,
      payload: parsed.payload,
      ...options,
    });
    return {
      success: true,
      itemId: item.id,
      responseText,
      title: item.title,
      dueDate: item.due_date ?? "",
    };
  } catch (error) {
    if (error instanceof NluTaskServiceError) {
      return { success: false, code: error.code, message: error.message };
    }
    return {
      success: false,
      code: "database_error",
      message: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}
