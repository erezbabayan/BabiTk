import { clientTimezone, uploadNotebookOcrApi } from "./api";
import { currentAccessToken } from "./whatsapp-gateway";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";

const INGEST_TIMEOUT_MS = 20_000;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function invokeWithTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("transcription_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ingestVoiceViaEdge(
  blob: Blob,
  mimeType: string,
  durationSeconds?: number,
): Promise<void> {
  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("יש להתחבר כדי לקלוט הקלטה");
  }
  const audioBase64 = await blobToBase64(blob);
  const fileName = `recording.${mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"}`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const payload = {
    action: "ingestVoice",
    audioBase64,
    mimeType,
    fileName,
    durationSeconds,
  };

  const connect = await invokeWithTimeout(
    supabase.functions.invoke("whatsapp-green-connect", { headers, body: payload }),
    INGEST_TIMEOUT_MS,
  );
  if (!connect.error && parseIngestPayload(connect.data)) {
    return;
  }

  const dedicated = await invokeWithTimeout(
    supabase.functions.invoke("ingest-voice", {
      headers,
      body: {
        audioBase64,
        mimeType,
        fileName,
        durationSeconds,
      },
    }),
    INGEST_TIMEOUT_MS,
  );
  if (dedicated.error) {
    throw new Error(dedicated.error.message || "תמלול ההקלטה נכשל");
  }
  if (!parseIngestPayload(dedicated.data)) {
    throw new Error("transcription_empty");
  }
}

function parseIngestPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if ("stateInstance" in record || "qrBase64" in record) return false;
  if (typeof record.error === "string" && record.error.length > 0) {
    throw new Error(record.error);
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  return title.length > 0;
}

async function ingestVoiceViaExpress(
  blob: Blob,
  mimeType: string,
  durationSeconds?: number,
): Promise<void> {
  const token = await currentAccessToken();
  if (!token) throw new Error("יש להתחבר כדי לקלוט הקלטה");

  const form = new FormData();
  const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  form.append("file", blob, `recording.${extension}`);
  form.append("timezone", clientTimezone());
  form.append("locale", "he-IL");
  if (durationSeconds != null) {
    form.append("durationSeconds", String(durationSeconds));
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

  if (isSupabaseConfigured) {
    try {
      await ingestVoiceViaEdge(blob, mimeType, options?.durationSeconds);
      return;
    } catch (error) {
      if (import.meta.env.VITE_API_URL?.trim()) {
        await ingestVoiceViaExpress(blob, mimeType, options?.durationSeconds);
        return;
      }
      throw error;
    }
  }

  await ingestVoiceViaExpress(blob, mimeType, options?.durationSeconds);
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
