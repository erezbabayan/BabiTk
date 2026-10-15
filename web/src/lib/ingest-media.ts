import { clientTimezone, uploadNotebookOcrApi } from "./api";
import { currentAccessToken } from "./whatsapp-gateway";
import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { EDGE_NOTEBOOK_TIMEOUT_MS, normalizeAsrUpload } from "./fast-voice-asr";
import { persistRecordedVoiceTranscript } from "./transcribe-voice-item";
import { blobToWhisperWav } from "./voice-wav";

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
 * Transcribe to Hebrew prose first, then insert the inbox row.
 * Never persist "מתמלל…" / voice placeholders as board items.
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
    const prepared = await blobToWhisperWav(blob);
    const upload = normalizeAsrUpload(
      prepared.fileName,
      prepared.mimeType || mimeType,
    );
    try {
      await persistRecordedVoiceTranscript({
        blob: prepared.blob,
        mimeType: upload.mimeType,
        fileName: upload.fileName,
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

async function ingestNotebookViaEdge(blob: Blob, mimeType: string, fileName: string): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const token = await currentAccessToken();
  if (!supabaseUrl || !token) {
    throw new Error("יש להתחבר כדי לסרוק תמונה");
  }
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("mimeType", mimeType);
  form.append("fileName", fileName);
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/ingest-notebook`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey || token,
    },
    body: form,
    signal: AbortSignal.timeout(EDGE_NOTEBOOK_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as {
    ok?: unknown;
    title?: unknown;
    error?: unknown;
    reason?: unknown;
  } | null;
  if (!response.ok || data?.error) {
    const reason =
      (typeof data?.reason === "string" && data.reason) ||
      (typeof data?.error === "string" && data.error) ||
      `edge_http_${response.status}`;
    throw new Error(reason);
  }
  if (data?.ok !== true && typeof data?.title !== "string") {
    throw new Error("ocr_failed");
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
  const fileName = `notebook.${extension}`;
  if (isSupabaseConfigured) {
    await ingestNotebookViaEdge(blob, mimeType, fileName);
    return;
  }

  const file = new File([blob], fileName, { type: mimeType });
  await uploadNotebookOcrApi(file);
}

export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

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

export function createVoiceRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickSupportedAudioMimeType();
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: 64_000,
  };
  if (mimeType) options.mimeType = mimeType;
  try {
    return new MediaRecorder(stream, options);
  } catch {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }
}

export function isWebMediaCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}
