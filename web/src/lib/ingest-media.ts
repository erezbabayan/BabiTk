import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { clientTimezone } from "./api";
import { requireConvex } from "./convex";
import { resolveConvexUserId } from "./convex-user-cache";
import { useConvexBackend } from "./data-backend";
import { asDirectConvexUserId } from "./legacy-user-id";
import { isDemoMode } from "./supabase";

async function resolveUserId(legacyUserId: string): Promise<Id<"users">> {
  const convex = requireConvex();
  const direct = asDirectConvexUserId(legacyUserId);
  if (direct) return direct;
  return await resolveConvexUserId(legacyUserId, () =>
    convex.mutation(api.users.getOrCreateByLegacyId, { legacyId: legacyUserId }),
  );
}

async function uploadBlobToConvex(
  blob: Blob,
  mimeType: string,
): Promise<Id<"_storage">> {
  const convex = requireConvex();
  const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType || blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error("העלאת הקובץ לשרת נכשלה");
  }
  const payload = (await response.json()) as { storageId?: string };
  if (!payload.storageId) {
    throw new Error("תשובת העלאה לא תקינה");
  }
  return payload.storageId as Id<"_storage">;
}

export async function ingestVoiceBlobForUser(
  legacyUserId: string,
  blob: Blob,
  options?: { durationSeconds?: number; mimeType?: string },
): Promise<void> {
  if (isDemoMode) {
    throw new Error("הקלטה אינה זמינה במצב הדגמה בדפדפן");
  }
  if (!useConvexBackend()) {
    throw new Error("קליטה קולית בדפדפן דורשת Convex");
  }

  const mimeType = options?.mimeType || blob.type || "audio/webm";
  if (blob.size < 64) {
    throw new Error("ההקלטה ריקה");
  }

  const convex = requireConvex();
  const userId = await resolveUserId(legacyUserId);
  const storageId = await uploadBlobToConvex(blob, mimeType);

  await convex.action(api.captureActions.ingestVoiceCapture, {
    userId,
    storageId,
    mimeType,
    timezone: clientTimezone(),
    locale: "he-IL",
    durationSeconds: options?.durationSeconds,
  });
}

export async function ingestImageBlobForUser(
  legacyUserId: string,
  blob: Blob,
  options?: { mimeType?: string },
): Promise<void> {
  if (isDemoMode) {
    throw new Error("סריקת תמונה אינה זמינה במצב הדגמה בדפדפן");
  }
  if (!useConvexBackend()) {
    throw new Error("סריקת תמונה בדפדפן דורשת Convex");
  }

  const mimeType = options?.mimeType || blob.type || "image/jpeg";
  if (blob.size < 64) {
    throw new Error("התמונה ריקה");
  }

  const convex = requireConvex();
  const userId = await resolveUserId(legacyUserId);
  const storageId = await uploadBlobToConvex(blob, mimeType);

  await convex.action(api.captureActions.ingestNotebookImage, {
    userId,
    storageId,
    mimeType,
    timezone: clientTimezone(),
    locale: "he-IL",
  });
}

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function isWebMediaCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}
