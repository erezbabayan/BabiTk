export const OPTIMISTIC_ITEMS_EVENT = "babitk:optimistic-items";
export const OPTIMISTIC_ROLLBACK_EVENT = "babitk:optimistic-rollback";

export function clientCaptureId(row: { id?: string; metadata?: unknown }): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { client_capture_id?: unknown }).client_capture_id;
  return typeof value === "string" && value ? value : null;
}

export function mergeOptimisticRows<T extends { id: string; metadata?: unknown }>(
  server: T[],
  pending: T[],
): T[] {
  if (pending.length === 0) return server;
  const seen = new Set<string>();
  for (const row of server) {
    seen.add(row.id);
    const capture = clientCaptureId(row);
    if (capture) seen.add(capture);
  }
  const stillPending = pending.filter((row) => !seen.has(row.id));
  return [...stillPending, ...server];
}

export function dispatchOptimisticItems(items: Array<{ id: string }>): void {
  if (typeof window === "undefined" || items.length === 0) return;
  window.dispatchEvent(new CustomEvent(OPTIMISTIC_ITEMS_EVENT, { detail: { items } }));
}

export function dispatchOptimisticRollback(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  window.dispatchEvent(new CustomEvent(OPTIMISTIC_ROLLBACK_EVENT, { detail: { ids } }));
}
