/** Pure helpers for WhatsApp capture dedupe, including soft-deleted tombstones. */

export function isSoftDeletedCapturedItem(row: {
  deleted_at?: string | null;
}): boolean {
  return typeof row.deleted_at === "string" && row.deleted_at.length > 0;
}

export function isStableWhatsAppMessageId(messageId: string): boolean {
  const id = messageId.trim();
  if (!id) return false;
  // Webhook fallback when Green-API omitted idMessage — never a durable key.
  if (/^green-\d+$/.test(id)) return false;
  return true;
}

/** Durable capture key: keep a real WhatsApp id, otherwise mint `wa-<uuid>`. */
export function ensureWhatsAppMessageId(messageId: string): string {
  const trimmed = messageId.trim();
  if (isStableWhatsAppMessageId(trimmed)) return trimmed;
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  return `wa-${uuid}`;
}

export function preferLiveCapturedItem<T extends { deleted_at?: string | null }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return rows.find((row) => !isSoftDeletedCapturedItem(row)) ?? rows[0] ?? null;
}

/** Any matching row — live or deleted — means do not insert a new capture. */
export function shouldSkipWhatsAppRecapture(
  row: { deleted_at?: string | null } | null,
): boolean {
  return row !== null;
}
