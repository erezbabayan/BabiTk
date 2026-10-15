/**
 * Detect image containers from magic bytes so Green-API downloadFile
 * JPEG/PNG bodies are not treated as failed JSON.
 */

export type ImageContainer = "jpeg" | "png" | "webp" | "gif" | "bmp" | "heic" | "unknown";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sniffImageContainer(bytes: Uint8Array): ImageContainer {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(bytes, [0x42, 0x4d])) return "bmp";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (bytes.byteLength >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0,
    ).toLowerCase();
    if (brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1" || brand === "heix") {
      return "heic";
    }
  }
  return "unknown";
}

export function isLikelyImageBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 32 && sniffImageContainer(bytes) !== "unknown";
}

export function mimeForImageContainer(
  container: ImageContainer,
  fallback = "image/jpeg",
): string {
  if (container === "png") return "image/png";
  if (container === "webp") return "image/webp";
  if (container === "gif") return "image/gif";
  if (container === "bmp") return "image/bmp";
  if (container === "heic") return "image/heic";
  if (container === "jpeg") return "image/jpeg";
  const safe = fallback.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
  if (safe === "image/jpg") return "image/jpeg";
  return safe.startsWith("image/") ? safe : "image/jpeg";
}

export function normalizeImageMime(mimeType: string): string {
  const safe = mimeType.startsWith("image/")
    ? mimeType.split(";")[0]!.trim().toLowerCase()
    : "image/jpeg";
  if (safe === "image/jpg") return "image/jpeg";
  return safe;
}

export function imageFileName(messageId: string, mimeType: string): string {
  const mime = normalizeImageMime(mimeType);
  if (mime.includes("png")) return `${messageId}.png`;
  if (mime.includes("webp")) return `${messageId}.webp`;
  if (mime.includes("gif")) return `${messageId}.gif`;
  return `${messageId}.jpg`;
}

export function isImageDocumentName(fileName: string, mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(fileName);
}
