import { clientTimezone, uploadNotebookOcrApi } from "./api";
import { currentAccessToken } from "./whatsapp-gateway";
import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { persistRecordedVoiceTranscript } from "./transcribe-voice-item";

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

/**
 * Transcribe via Edge `ingest-voice` (Groq whisper-large-v3-turbo, ~0.5–3s).
 * Hugging Face Gradio is a last-resort fallback inside persistRecordedVoiceTranscript.
 */
export async function ingestVoiceBlobForUser(
  _legacyUserId: string,
  blob: Blob,
  options?: { durationSeconds?: number; mimeType?: string; hintTranscript?: string },
): Promise<void> {
  if (isDemoMode) {
    throw new Error("הקלטה אינה זמינה במצב הדגמה בדפדפן");
  }

  const mimeType = options?.mimeType || blob.type || "audio/webm";
  if (blob.size < 64) {
    throw new Error("ההקלטה ריקה");
  }

  if (isSupabaseConfigured) {
    const fileName = `recording.${mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"}`;
    try {
      await persistRecordedVoiceTranscript({
        blob,
        mimeType,
        fileName,
        durationSeconds: options?.durationSeconds,
        hintTranscript: options?.hintTranscript,
      });
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
