/**
 * Detect real audio containers from magic bytes and pick Whisper-safe
 * filenames. WhatsApp PTT is Ogg/Opus; Groq/OpenAI sniff the file, not the
 * Green-API Content-Type.
 */

export type AudioContainer = "ogg" | "wav" | "mp4" | "mp3" | "webm" | "unknown";

export type AsrUpload = { fileName: string; mimeType: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sniffAudioContainer(bytes: Uint8Array): AudioContainer {
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return "ogg"; // OggS
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) {
    return "wav";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4";
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return "mp3";
  }
  return "unknown";
}

export function isLikelyAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return false;
  if (sniffAudioContainer(bytes) !== "unknown") return true;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 32)).trimStart();
  if (head.startsWith("{") || head.startsWith("<") || /^HTTP\//i.test(head)) return false;
  return false;
}

export function mimeForContainer(
  container: AudioContainer,
  fallback = "audio/ogg",
): string {
  if (container === "wav") return "audio/wav";
  if (container === "mp4") return "audio/mp4";
  if (container === "mp3") return "audio/mpeg";
  if (container === "webm") return "audio/webm";
  if (container === "ogg") return "audio/ogg";
  return fallback.split(";")[0]?.trim() || "audio/ogg";
}

export function asrUploadVariants(
  fileName: string,
  mimeType: string,
  bytes?: Uint8Array,
): AsrUpload[] {
  const container = bytes ? sniffAudioContainer(bytes) : "unknown";
  const mime = (mimeType || "").toLowerCase().split(";")[0]?.trim() || "";
  const lowerName = fileName.toLowerCase();
  const looksOgg =
    container === "ogg" ||
    mime.includes("ogg") ||
    mime.includes("opus") ||
    lowerName.endsWith(".ogg") ||
    lowerName.endsWith(".oga") ||
    lowerName.endsWith(".opus");
  if (looksOgg || container === "unknown") {
    return [
      { fileName: "audio.ogg", mimeType: "audio/ogg" },
      { fileName: "audio.opus", mimeType: "audio/opus" },
      { fileName: "audio.oga", mimeType: "audio/ogg" },
    ];
  }
  if (container === "wav" || mime.includes("wav") || lowerName.endsWith(".wav")) {
    return [{ fileName: "recording.wav", mimeType: "audio/wav" }];
  }
  if (
    container === "mp4" ||
    mime.includes("mp4") ||
    mime.includes("m4a") ||
    lowerName.endsWith(".m4a") ||
    lowerName.endsWith(".mp4")
  ) {
    return [{ fileName: "recording.m4a", mimeType: "audio/mp4" }];
  }
  if (container === "mp3" || mime.includes("mpeg") || mime.includes("mp3") || lowerName.endsWith(".mp3")) {
    return [{ fileName: "recording.mp3", mimeType: "audio/mpeg" }];
  }
  if (container === "webm" || mime.includes("webm") || lowerName.endsWith(".webm")) {
    return [{ fileName: "recording.webm", mimeType: "audio/webm" }];
  }
  return [{ fileName: "audio.ogg", mimeType: "audio/ogg" }];
}
