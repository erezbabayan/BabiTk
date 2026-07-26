import type { MindtaskerItem } from "./supabase";
import { isDemoMode } from "./supabase";
import { isConvexConfigured } from "./convex";

let resyncInFlight: Promise<void> | null = null;
let lastSyncedVersion: number | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
export function isConvexMirrorEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  if (!isDemoMode) return false;
  return isConvexConfigured;
}

export function invalidateConvexMirrorCache(): void {
  lastSyncedVersion = null;
}

export async function mirrorItemToConvex(_item: MindtaskerItem): Promise<void> {
  if (!isConvexMirrorEnabled()) return;
}

async function resyncAllItemsToConvexNow(_force = false): Promise<void> {
  if (!isConvexMirrorEnabled()) return;
}

export function scheduleResyncAllItemsToConvex(delayMs = 400): void {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    void resyncAllItemsToConvex();
  }, delayMs);
}

export async function resyncAllItemsToConvex(force = false): Promise<void> {
  if (resyncInFlight) {
    await resyncInFlight;
    return;
  }

  resyncInFlight = resyncAllItemsToConvexNow(force).finally(() => {
    resyncInFlight = null;
  });
  await resyncInFlight;
}
