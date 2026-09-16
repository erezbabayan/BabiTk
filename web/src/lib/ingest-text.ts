import { ingestTextApi, clientTimezone } from "./api";
import { useConvexBackend } from "./data-backend";
import { requireConvex } from "./convex";
import { resolveConvexUserId } from "./convex-user-cache";
import { asDirectConvexUserId } from "./legacy-user-id";
import { invalidateSyncCache } from "./demo-store";
import { ingestTextSync } from "./sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { api } from "../../../convex/_generated/api";

export function formatIngestError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "לא ניתן להתחבר לשרת. נסה שוב או בדוק את החיבור.";
    }
    return error.message;
  }
  return "שגיאה בקליטה";
}

async function ingestViaConvex(legacyUserId: string, text: string): Promise<void> {
  const convex = requireConvex();
  const directConvexUserId = asDirectConvexUserId(legacyUserId);
  const convexUserId =
    directConvexUserId ??
    (await resolveConvexUserId(legacyUserId, () =>
      convex.mutation(api.users.getOrCreateByLegacyId, { legacyId: legacyUserId }),
    ));

  await convex.action(api.captureActions.ingestQuickText, {
    userId: convexUserId,
    text,
    timezone: clientTimezone(),
    locale: "he-IL",
  });
}

async function ingestViaSupabase(userId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? "פריט חדש";
  const title = firstLine.trim().slice(0, 120);
  const now = Date.now();
  const { error } = await supabase.from("mindtasker_items").insert({
    user_id: userId,
    title,
    content: trimmed,
    is_actionable: true,
    status: "inbox",
    tags: [],
    metadata: { source: "typed_text" },
    sort_order: now,
    last_interacted_at: new Date(now).toISOString(),
  });
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

  if (useConvexBackend()) {
    await ingestViaConvex(legacyUserId, text);
    return;
  }

  await ingestTextApi(text);
}
