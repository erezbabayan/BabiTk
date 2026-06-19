import { getSupabaseAdmin } from "../lib/supabase.js";
import type { ParsedItem } from "../types/ai.js";
import { extractAnalysisMetadata } from "./item-analysis.service.js";
import { resolveIngestItemStatus } from "./entity-rules.service.js";
import type { DbMindtaskerItem, DbSourceMaterial, SourceType } from "../types/database.js";
import { syncNoteEmbedding } from "./search.service.js";
import { syncTaskToCalendar } from "./calendar.service.js";
import { resolveRestoreFromArchivePatch } from "../lib/item-restore.js";

export interface CreateSourceMaterialInput {
  userId: string;
  sourceType: SourceType;
  rawText: string | null;
  storageUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SaveIngestionInput {
  userId: string;
  source: CreateSourceMaterialInput;
  items: ParsedItem[];
}

export interface SaveIngestionResult {
  sourceMaterial: DbSourceMaterial;
  items: DbMindtaskerItem[];
}

export async function createSourceMaterial(
  input: CreateSourceMaterialInput,
): Promise<DbSourceMaterial> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("source_materials")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      raw_text: input.rawText,
      storage_url: input.storageUrl ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create source material: ${error.message}`);
  }

  return data as DbSourceMaterial;
}

export async function saveParsedItems(
  userId: string,
  sourceMaterialId: string,
  parsedItems: ParsedItem[],
): Promise<DbMindtaskerItem[]> {
  const supabase = getSupabaseAdmin();

  const rows = parsedItems.map((item) => ({
    user_id: userId,
    source_material_id: sourceMaterialId,
    title: item.title,
    content: item.content,
    is_actionable: item.is_actionable,
    status: resolveIngestItemStatus(item),
    due_date: item.is_actionable ? item.due_date : null,
    tags: item.tags,
    metadata: extractAnalysisMetadata(item) ?? {},
  }));

  const { data, error } = await supabase
    .from("mindtasker_items")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(`Failed to save items: ${error.message}`);
  }

  return data as DbMindtaskerItem[];
}

export async function getItemById(
  itemId: string,
  userId: string,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`Item not found: ${error?.message ?? itemId}`);
  }

  return data as DbMindtaskerItem;
}

export interface ToggleItemTypeOptions {
  due_date?: string | null;
}

export async function toggleItemType(
  userId: string,
  itemId: string,
  options?: ToggleItemTypeOptions,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();
  const item = await getItemById(itemId, userId);
  const becomesTask = !item.is_actionable;

  const patch: Record<string, unknown> = {
    is_actionable: becomesTask,
    last_interacted_at: new Date().toISOString(),
  };

  if (becomesTask) {
    patch.due_date = options?.due_date ?? null;
    patch.embedding = null;
  } else {
    patch.due_date = null;
    patch.completed_at = null;
    patch.calendar_event_id = null;
    if (item.status === "completed") {
      patch.status = "pending";
    }
  }

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update(patch)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to toggle item type: ${error?.message ?? itemId}`);
  }

  if (!becomesTask) {
    await syncNoteEmbedding(itemId);
  }

  return data as DbMindtaskerItem;
}

export async function approveItem(
  userId: string,
  itemId: string,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();
  const item = await getItemById(itemId, userId);

  if (item.status !== "inbox") {
    throw new Error("Only inbox items can be approved");
  }

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update({
      status: "pending",
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to approve item: ${error?.message ?? itemId}`);
  }

  if (item.is_actionable && item.due_date) {
    try {
      const eventId = await syncTaskToCalendar({
        userId,
        itemId,
        title: item.title,
        content: item.content,
        dueDate: item.due_date,
        existingEventId: item.calendar_event_id,
      });

      if (eventId) {
        const { error: calError } = await supabase
          .from("mindtasker_items")
          .update({ calendar_event_id: eventId })
          .eq("id", itemId);

        if (!calError) {
          (data as DbMindtaskerItem).calendar_event_id = eventId;
        }
      }
    } catch {
      // Best-effort: approval succeeds even if Google Calendar is unavailable
    }
  }

  return data as DbMindtaskerItem;
}

export async function completeItem(
  userId: string,
  itemId: string,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();
  await getItemById(itemId, userId);

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to complete item: ${error?.message ?? itemId}`);
  }

  return data as DbMindtaskerItem;
}

export async function snoozeItem(
  userId: string,
  itemId: string,
  dueDate: string,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();
  await getItemById(itemId, userId);

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update({
      due_date: dueDate,
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to snooze item: ${error?.message ?? itemId}`);
  }

  return data as DbMindtaskerItem;
}

export async function restoreFromArchive(
  userId: string,
  itemId: string,
): Promise<DbMindtaskerItem> {
  const supabase = getSupabaseAdmin();
  const item = await getItemById(itemId, userId);

  if (item.status !== "snoozed_archive") {
    throw new Error("Only archived items can be restored");
  }

  const restorePatch = resolveRestoreFromArchivePatch(item);

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update({
      status: restorePatch.status,
      metadata: restorePatch.metadata,
      completed_at: restorePatch.completed_at,
      last_interacted_at: restorePatch.last_interacted_at,
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to restore item: ${error?.message ?? itemId}`);
  }

  return data as DbMindtaskerItem;
}

export async function saveIngestionResult(
  input: SaveIngestionInput,
): Promise<SaveIngestionResult> {
  const sourceMaterial = await createSourceMaterial(input.source);
  const items = await saveParsedItems(
    input.userId,
    sourceMaterial.id,
    input.items,
  );

  return { sourceMaterial, items };
}

export async function findUserByPhone(phone: string) {
  return findInboxUserByPhone(phone);
}

/**
 * WhatsApp → Inbox routing lookup.
 *
 * The webhook provides the sender phone as `message.from`.
 * We ask Supabase: "Is there a verified user with this phone?"
 *   SELECT * FROM users WHERE phone = $normalized AND phone_verified = true
 *
 * If yes → caller inserts parsed content into that user's Inbox (items table).
 * If no  → caller rejects the message (user must link phone in Web/Mobile settings).
 */
export async function findInboxUserByPhone(phone: string) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizePhone(phone);

  const { data, error } = await supabase
    .from("users")
    .select("id, email, phone, phone_verified, tier, allocated_audio_seconds, used_audio_seconds")
    .eq("phone", normalized)
    .eq("phone_verified", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup user by phone: ${error.message}`);
  }

  return data;
}

export async function uploadSourceMedia(
  userId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const path = `${userId}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from("source-materials")
    .upload(path, buffer, { contentType, upsert: false });

  if (error) {
    throw new Error(`Failed to upload source media: ${error.message}`);
  }

  return path;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+972${digits.slice(1)}`;
  }
  return `+${digits}`;
}
