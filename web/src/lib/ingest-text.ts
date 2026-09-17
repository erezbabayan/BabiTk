import { ingestTextApi, clientTimezone } from "./api";
import { invalidateSyncCache } from "./demo-store";
import { inferTagsFromText } from "../../../convex/lib/ingest/tagInference";
import {
  parseIncomingMessage,
  parsedItemInsertFields,
  resolveAllowedTagNames,
} from "./parse-incoming-message";
import { ingestTextSync } from "./sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { formatIngestError } from "./ingest-error";

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

async function ingestViaSupabase(userId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const trimmed = text.trim();
  const allowedTags = await loadAllowedTagNames(userId);
  const parsed = parseIncomingMessage(trimmed, {
    allowedTags,
    timezone: clientTimezone(),
  });
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
    const fields = parsedItemInsertFields(item, { source: "typed_text" }, new Date(now + index));
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
      metadata: { source: "typed_text" },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    });
  }

  const { error } = await supabase.from("mindtasker_items").insert(rows);
  if (error) {
    throw new Error(error.message || "שמירת הפריט נכשלה");
  }
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
