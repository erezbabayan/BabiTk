/** Pure helpers for SecureStore chunking (~2KB per-value limit). */
export const SECURE_CHUNK_SIZE = 1800;
export const CHUNK_MARKER = "__chunked__:";

export function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function splitIntoChunks(
  value: string,
  size = SECURE_CHUNK_SIZE,
): string[] {
  if (value.length <= size) return [value];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size)
    chunks.push(value.slice(i, i + size));
  return chunks;
}

export function parseChunkMarker(raw: string | null): number | null {
  if (!raw || !raw.startsWith(CHUNK_MARKER)) return null;
  const n = Number(raw.slice(CHUNK_MARKER.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

