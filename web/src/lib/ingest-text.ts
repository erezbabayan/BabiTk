import { api } from "../../../convex/_generated/api";
import { ingestTextApi, clientTimezone } from "./api";
import { useConvexBackend } from "./data-backend";import { requireConvex } from "./convex";
import { resolveConvexUserId } from "./convex-user-cache";
import { asDirectConvexUserId } from "./legacy-user-id";
import { invalidateSyncCache } from "./demo-store";
import { ingestTextSync } from "./sync-client";
import { isDemoMode } from "./supabase";

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

export async function ingestTextForUser(legacyUserId: string, text: string): Promise<void> {
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
