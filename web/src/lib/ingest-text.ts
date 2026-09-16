import { ingestTextApi, clientTimezone } from "./api";
import { invalidateSyncCache } from "./demo-store";
import { ingestTextSync } from "./sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { buildSupabaseIngestRows } from "./supabase-ingest-rows";

export function formatIngestError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "לא ניתן להתחבר לשרת. נסה שוב או בדוק את החיבור.";
    }
    if (/^API error (404|405|501|502|503)$/.test(error.message.trim())) {
      return "";
    }
    return error.message;
  }
  return "שגיאה בקליטה";
}

async function ingestViaSupabase(userId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const rows = buildSupabaseIngestRows(userId, text, {
    timezone: clientTimezone(),
  });
  if (rows.length === 0) {
    throw new Error("אין טקסט לקליטה");
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
