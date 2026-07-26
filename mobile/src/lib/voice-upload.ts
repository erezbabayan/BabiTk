import * as FileSystem from "expo-file-system/legacy";

/** Soft cap for the Node-action base64 fallback (Node args max ~5 MiB). */
export const VOICE_BASE64_MAX_BYTES = 2.5 * 1024 * 1024;
/** Hard cap for storage uploads (Whisper / product limit). */
export const VOICE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

function guessAudioMimeType(uri: string, fallback = "audio/mp4"): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".mp3") || lower.includes("mpeg")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) return "audio/3gpp";
  // Expo HIGH_QUALITY recordings are AAC-in-MP4 (.m4a / .caf)
  if (
    lower.endsWith(".m4a") ||
    lower.endsWith(".mp4") ||
    lower.endsWith(".caf") ||
    lower.includes("m4a")
  ) {
    return "audio/mp4";
  }
  return fallback;
}

function normalizeFileUri(uri: string): string {
  if (uri.startsWith("file://") || uri.startsWith("content://")) return uri;
  if (uri.startsWith("/")) return `file://${uri}`;
  return uri;
}

/**
 * Copy the recording into app cache so the path stays valid after Recording unload.
 * Call as soon as stopAndUnloadAsync completes.
 */
export async function materializeLocalAudioUri(uri: string): Promise<string> {
  const normalized = normalizeFileUri(uri);
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("לא ניתן לגשת לאחסון המקומי במכשיר");
  }

  const dest = `${cacheDir}voice-capture-${Date.now()}.m4a`;

  const info = await FileSystem.getInfoAsync(normalized);
  if (!info.exists) {
    throw new Error("קובץ ההקלטה לא נמצא במכשיר");
  }

  await FileSystem.copyAsync({ from: normalized, to: dest });

  const copied = await FileSystem.getInfoAsync(dest);
  if (!copied.exists || (copied.size ?? 0) < 64) {
    throw new Error("ההקלטה ריקה או לא נשמרה במכשיר");
  }

  return dest;
}

async function ensureLocalAudioFile(
  uri: string,
): Promise<{ fileUri: string; mimeType: string; byteLength: number }> {
  const fileUri = await materializeLocalAudioUri(uri);
  const mimeType = guessAudioMimeType(fileUri);
  const info = await FileSystem.getInfoAsync(fileUri);
  const byteLength =
    info.exists && typeof info.size === "number" ? info.size : 0;
  if (byteLength < 64) {
    throw new Error("ההקלטה ריקה או לא נקראה מהמכשיר");
  }
  if (byteLength > VOICE_UPLOAD_MAX_BYTES) {
    throw new Error("ההקלטה ארוכה מדי (מעל 8MB). הקליטו עד כדקה.");
  }
  return { fileUri, mimeType, byteLength };
}

/**
 * Upload recording bytes to a Convex generateUploadUrl via native upload
 * (avoids RN fetch(ArrayBuffer) failures and Node action 5 MiB arg limits).
 */
export async function uploadLocalAudioToConvexUrl(
  uri: string,
  uploadUrl: string,
): Promise<{ storageId: string; mimeType: string; byteLength: number }> {
  const { fileUri, mimeType, byteLength } = await ensureLocalAudioFile(uri);

  const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": mimeType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `העלאת ההקלטה לשרת נכשלה (HTTP ${result.status}). נסו שוב.`,
    );
  }

  let storageId: string | undefined;
  try {
    const body = JSON.parse(result.body) as { storageId?: string };
    storageId = body.storageId;
  } catch {
    throw new Error("תשובת העלאה מהשרת לא תקינה");
  }

  if (!storageId) {
    throw new Error("השרת לא החזיר מזהה קובץ להקלטה");
  }

  return { storageId, mimeType, byteLength };
}

/** Upload a local image (camera/gallery) to Convex storage. */
export async function uploadLocalImageToConvexUrl(
  uri: string,
  uploadUrl: string,
  mimeTypeHint?: string,
): Promise<{ storageId: string; mimeType: string; byteLength: number }> {
  const fileUri = normalizeFileUri(uri);
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error("קובץ התמונה לא נמצא במכשיר");
  }
  const byteLength = typeof info.size === "number" ? info.size : 0;
  if (byteLength < 64) {
    throw new Error("התמונה ריקה");
  }
  if (byteLength > 12 * 1024 * 1024) {
    throw new Error("התמונה גדולה מדי (מעל 12MB)");
  }

  const lower = fileUri.toLowerCase();
  const mimeType =
    mimeTypeHint ||
    (lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".gif")
          ? "image/gif"
          : "image/jpeg");

  const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": mimeType },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`העלאת התמונה לשרת נכשלה (HTTP ${result.status})`);
  }

  let storageId: string | undefined;
  try {
    const body = JSON.parse(result.body) as { storageId?: string };
    storageId = body.storageId;
  } catch {
    throw new Error("תשובת העלאה מהשרת לא תקינה");
  }
  if (!storageId) {
    throw new Error("השרת לא החזיר מזהה קובץ לתמונה");
  }

  return { storageId, mimeType, byteLength };
}

/**
 * Read a local recording as base64 — only for short clips under the Node arg limit.
 */
export async function readLocalAudioAsBase64(
  uri: string,
): Promise<{ base64: string; mimeType: string; byteLength: number }> {
  const { fileUri, mimeType, byteLength } = await ensureLocalAudioFile(uri);

  if (byteLength > VOICE_BASE64_MAX_BYTES) {
    throw new Error(
      "ההקלטה גדולה מדי לנתיב הגיבוי. יש להשתמש בהעלאה לשרת.",
    );
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64 || base64.length < 32) {
    throw new Error("ההקלטה ריקה או לא נקראה מהמכשיר");
  }

  return { base64, mimeType, byteLength };
}

export { guessAudioMimeType };
