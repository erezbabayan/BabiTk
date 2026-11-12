/**
 * Optimistic item patches for the mobile board: the card changes on tap, the
 * Supabase update runs in the background, and only the patched fields are
 * rolled back if it fails (fields changed meanwhile by realtime are kept).
 */
type Row = { id: string } & Record<string, unknown>;

export function applyOptimisticPatch<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return { ...item, ...patch };
  });
  return changed ? next : items;
}

/** Fields of `previous` for exactly the keys the patch touched. */
export function snapshotPatchedFields<T extends { id: string }>(
  previous: T | undefined,
  patch: Partial<T>,
): Partial<T> | null {
  if (!previous) return null;
  const snapshot: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    snapshot[key] = previous[key];
  }
  return snapshot;
}

export function rollbackOptimisticPatch<T extends { id: string }>(
  items: T[],
  id: string,
  snapshot: Partial<T> | null,
): T[] {
  if (!snapshot) return items;
  return applyOptimisticPatch(items, id, snapshot);
}

/** Merge the row returned by UPDATE … RETURNING, keeping the joined source. */
export function mergeServerRow<T extends { id: string }>(
  items: T[],
  serverRow: Row | null | undefined,
): T[] {
  if (!serverRow || typeof serverRow.id !== "string") return items;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(serverRow)) {
    if (value !== undefined && key !== "source_materials") fields[key] = value;
  }
  return applyOptimisticPatch(items, serverRow.id, fields as Partial<T>);
}
