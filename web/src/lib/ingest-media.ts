import { clientTimezone, uploadNotebookOcrApi } from "./api";
import { isDemoMode, requireSupabase } from "./supabase";

async function getAccessToken(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function ingestVoiceBlobForUser(
  _legacyUserId: string,
  blob: Blob,
  options?: { durationSeconds?: number; mimeType?: string },
): Promise<void> {
  if (isDemoMode) {
    throw new Error("הקלטה אינה זמינה במצב הדגמה בדפדפן");
  }

  const mimeType = options?.mimeType || blob.type || "audio/webm";
  if (blob.size < 64) {
    throw new Error("ההקלטה ריקה");
  }

  const token = await getAccessToken();
  if (!token) throw new Error("יש להתחבר כדי לקלוט הקלטה");

  const form = new FormData();
  const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  form.append("file", blob, `recording.${extension}`);
  form.append("timezone", clientTimezone());
  form.append("locale", "he-IL");
  if (options?.durationSeconds != null) {
    form.append("durationSeconds", String(options.durationSeconds));
  }

  const response = await fetch("/api/ai/voice-ingest", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "קליטת ההקלטה נכשלה — נדרש שרת AI");
  }
}

export async function ingestImageBlobForUser(
  _legacyUserId: string,
  blob: Blob,
  options?: { mimeType?: string },
): Promise<void> {
  if (isDemoMode) {
    throw new Error("סריקת תמונה אינה זמינה במצב הדגמה בדפדפן");
  }

  const mimeType = options?.mimeType || blob.type || "image/jpeg";
  if (blob.size < 64) {
    throw new Error("התמונה ריקה");
  }

  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const file = new File([blob], `notebook.${extension}`, { type: mimeType });
  await uploadNotebookOcrApi(file);
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
