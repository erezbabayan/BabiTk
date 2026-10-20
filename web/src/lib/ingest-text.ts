import { ingestTextApi, clientTimezone } from "./api";
import {
  peekAllowedTagNames,
  publishAllowedTagNames,
} from "./allowed-tags-cache";
import { invalidateSyncCache } from "./demo-store";
import { inferTagsFromText } from "../../../convex/lib/ingest/tagInference";
import {
  dispatchOptimisticItems,
  dispatchOptimisticRollback,
} from "./optimistic-capture";
import {
  parseIncomingMessage,
  parsedItemInsertFields,
  resolveAllowedTagNames,
} from "./parse-incoming-message";
import { ingestTextSync } from "./sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { formatIngestError } from "./ingest-error";
import type { MindtaskerItem } from "../types";

export { formatIngestError };

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

async function resolveAllowedTags(userId: string): Promise<{ names: string[]; cacheHit: boolean }> {
  const cached = peekAllowedTagNames(userId);
  if (cached) {
    if (!cached.fresh) {
      void loadAllowedTagNames(userId)
        .then((names) => publishAllowedTagNames(userId, names))
        .catch(() => {});
    }
    return { names: cached.names, cacheHit: true };
  }
  const names = await loadAllowedTagNames(userId);
  publishAllowedTagNames(userId, names);
  return { names, cacheHit: false };
}

function captureId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toOptimisticItem(
  row: {
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
  },
): MindtaskerItem {
  const id = String(row.metadata.client_capture_id);
  const now = new Date().toISOString();
  return {
    id,
    user_id: row.user_id,
    source_material_id: null,
    title: row.title,
    content: row.content,
    is_actionable: row.is_actionable,
    status: "inbox",
    due_date: row.due_date,
    completed_at: null,
    tags: row.tags,
    metadata: row.metadata,
    sort_order: row.sort_order,
    last_interacted_at: row.last_interacted_at,
    created_at: now,
    updated_at: now,
  };
}

async function ingestViaSupabase(userId: string, text: string): Promise<void> {
  const startedAt = performance.now();
  const supabase = requireSupabase();
  const trimmed = text.trim();
  const tagsStarted = performance.now();
  const { names: allowedTags, cacheHit } = await resolveAllowedTags(userId);
  const tagsMs = performance.now() - tagsStarted;
  const parseStarted = performance.now();
  const parsed = parseIncomingMessage(trimmed, {
    allowedTags,
    timezone: clientTimezone(),
  });
  const parseMs = performance.now() - parseStarted;
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
  }> = parsed.map((item, index) => {
    const id = captureId();
    const fields = parsedItemInsertFields(
      item,
      { source: "typed_text", client_capture_id: id },
      new Date(now + index),
    );
    return {
      user_id: userId,
      title: fields.title,
      content: fields.content,
      is_actionable: fields.is_actionable,
      status: "inbox",
      due_date: fields.due_date,
      tags: fields.tags,
      metadata: fields.metadata,
      sort_order: now + index,
      last_interacted_at: new Date(now).toISOString(),
    };
  });

  if (rows.length === 0) {
    const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? "פריט חדש";
    rows.push({
      user_id: userId,
      title: firstLine.trim().slice(0, 120),
      content: trimmed,
      is_actionable: true,
      status: "inbox",
      due_date: null,
      tags: inferTagsFromText(trimmed, allowedTags),
      metadata: { source: "typed_text", client_capture_id: captureId() },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    });
  }

  const optimistic = rows.map(toOptimisticItem);
  dispatchOptimisticItems(optimistic);
  const insertStarted = performance.now();
  const { error } = await supabase.from("mindtasker_items").insert(rows);
  const insertMs = performance.now() - insertStarted;
  if (error) {
    dispatchOptimisticRollback(optimistic.map((item) => item.id));
    throw new Error(error.message || "שמירת הפריט נכשלה");
  }
  console.info(
    `[ingest-timing] ${JSON.stringify({
      path: "web-text",
      cacheHit,
      tagsMs: Math.round(tagsMs),
      parseMs: Math.round(parseMs),
      insertMs: Math.round(insertMs),
      totalMs: Math.round(performance.now() - startedAt),
      items: rows.length,
    })}`,
  );
}

export async function ingestTextForUser(legacyUserId: string, text: string): Promise<void> {
  if (isSupabaseConfigured) {
    await ingestViaSupabase(legacyUserId, text);
    return;
  }

  if (isDemoMode) {
    await ingestTextSync({
      text,
      sourceType: "whatsapp_text",
      timezone: clientTimezone(),
    });
    invalidateSyncCache();
    return;
  }

  await ingestTextApi(text);
}
