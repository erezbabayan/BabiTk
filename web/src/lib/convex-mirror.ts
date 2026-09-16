import { isDemoMode } from "./supabase";

/** Convex was removed — never open a Convex client or websocket. */
export function isConvexMirrorEnabled(): boolean {
  return false;
}

export function invalidateConvexMirrorCache(): void {}

export async function mirrorItemToConvex(_item: unknown): Promise<void> {
  void _item;
}

export function scheduleResyncAllItemsToConvex(_delayMs = 400): void {
  void _delayMs;
}

export async function resyncAllItemsToConvex(_force = false): Promise<void> {
  void _force;
  if (isDemoMode) return;
}
