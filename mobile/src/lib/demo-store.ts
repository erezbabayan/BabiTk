import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MindtaskerItem } from "./supabase";
import {
  createSyncItem,
  deleteSyncItem,
  fetchSyncItemsIfChanged,
  fetchSyncTrash,
  getSyncApiBase,
  hardDeleteSyncItem,
  isSyncEnabled,
  patchSyncItem,
  syncConnectionHint,
} from "./sync-client";
import { trashCutoffIso, type TrashItem } from "./trash";
import { resolveRestoreFromTrashPatch } from "./item-restore";
import { buildDemoTestItems, isDemoSeedItemId } from "./demo-seed-data";
import {
  invalidateConvexMirrorCache,
  mirrorItemToConvex,
  scheduleResyncAllItemsToConvex,
} from "./convex-mirror";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_LOGIN_EMAIL = "demo@mindtasker.local";
export const DEMO_LOGIN_PASSWORD = "demo";
const DEMO_SESSION_KEY = "mindtasker:demo:session";
const DEMO_ITEMS_CACHE_KEY = "mindtasker:demo:items-cache";
const DEMO_PREMIUM_KEY = "mindtasker:demo:premium";
let knownSyncVersion: number | null = null;

export async function isDemoPremium(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEMO_PREMIUM_KEY)) === "true";
}

export async function setDemoPremium(premium: boolean): Promise<void> {
  if (premium) {
    await AsyncStorage.setItem(DEMO_PREMIUM_KEY, "true");
  } else {
    await AsyncStorage.removeItem(DEMO_PREMIUM_KEY);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Full payload required by POST /api/sync/items */
function buildSyncItem(item: MindtaskerItem): Record<string, unknown> {
  const now = nowIso();
  return {
    id: item.id,
    user_id: DEMO_USER_ID,
    source_material_id: item.source_material_id ?? null,
    source_materials: item.source_materials ?? null,
    title: item.title,
    content: item.content ?? "",
    is_actionable: item.is_actionable,
    status: item.status,
    due_date: item.due_date ?? null,
    completed_at: item.completed_at ?? null,
    tags: item.tags ?? [],
    metadata: item.metadata ?? {},
    sort_order: Date.now(),
    last_interacted_at: item.last_interacted_at ?? now,
    created_at: now,
    updated_at: now,
  };
}

function buildSyncPatch(patch: Partial<MindtaskerItem>): Record<string, unknown> {
  const allowed: Record<string, unknown> = {
    last_interacted_at: patch.last_interacted_at ?? nowIso(),
  };
  if (patch.title !== undefined) allowed.title = patch.title;
  if (patch.content !== undefined) allowed.content = patch.content;
  if (patch.is_actionable !== undefined) allowed.is_actionable = patch.is_actionable;
  if (patch.status !== undefined) allowed.status = patch.status;
  if (patch.due_date !== undefined) allowed.due_date = patch.due_date;
  if (patch.completed_at !== undefined) allowed.completed_at = patch.completed_at;
  if (patch.tags !== undefined) allowed.tags = patch.tags;
  if (patch.metadata !== undefined) allowed.metadata = patch.metadata;
  if (patch.source_material_id !== undefined) allowed.source_material_id = patch.source_material_id;
  if (patch.source_materials !== undefined) allowed.source_materials = patch.source_materials;
  if (patch.deleted_at !== undefined) allowed.deleted_at = patch.deleted_at;
  if (patch.sort_order !== undefined) allowed.sort_order = patch.sort_order;
  return allowed;
}

function activeItems(items: MindtaskerItem[]): MindtaskerItem[] {
  return items.filter((item) => !item.deleted_at);
}

async function readLocalCache(): Promise<MindtaskerItem[]> {
  const raw = await AsyncStorage.getItem(DEMO_ITEMS_CACHE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MindtaskerItem[];
  } catch {
    return [];
  }
}

async function writeLocalCache(items: MindtaskerItem[]): Promise<void> {
  await AsyncStorage.setItem(DEMO_ITEMS_CACHE_KEY, JSON.stringify(items));
}

export async function isDemoSessionActive(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEMO_SESSION_KEY)) === "1";
}

export async function enterDemoSession(): Promise<void> {
  await AsyncStorage.setItem(DEMO_SESSION_KEY, "1");
}

export async function exitDemoSession(): Promise<void> {
  await AsyncStorage.multiRemove([DEMO_SESSION_KEY, DEMO_ITEMS_CACHE_KEY, DEMO_PREMIUM_KEY]);
}

export async function getDemoItems(): Promise<MindtaskerItem[]> {
  const snapshot = await getDemoItemsSnapshot();
  return snapshot.items;
}

export async function getDemoItemsSnapshot(knownVersion: number | null = knownSyncVersion): Promise<{
  items: MindtaskerItem[];
  version: number | null;
  changed: boolean;
  syncOk: boolean;
  syncError: string | null;
}> {
  if (isSyncEnabled()) {
    try {
      const result = await fetchSyncItemsIfChanged<MindtaskerItem>(knownVersion);
      if (!result.changed) {
        const cached = activeItems(await readLocalCache());
        return {
          items: cached,
          version: result.version,
          changed: false,
          syncOk: true,
          syncError: null,
        };
      }
      await writeLocalCache(result.snapshot.items);
      knownSyncVersion = result.snapshot.version;
      scheduleResyncAllItemsToConvex();
      return {
        items: result.snapshot.items,
        version: result.snapshot.version,
        changed: true,
        syncOk: true,
        syncError: null,
      };
    } catch (error) {
      console.warn("Sync fetch failed, using local cache", error);
      const cached = activeItems(await readLocalCache());
      const message =
        error instanceof Error
          ? `${error.message} — ${syncConnectionHint()}`
          : syncConnectionHint();
      if (cached.length > 0) {
        return {
          items: cached,
          version: knownVersion,
          changed: false,
          syncOk: false,
          syncError: message,
        };
      }
      return {
        items: [],
        version: knownVersion,
        changed: true,
        syncOk: false,
        syncError: message,
      };
    }
  }

  const items = activeItems(await readLocalCache());
  return { items, version: null, changed: true, syncOk: true, syncError: null };
}

export async function seedDemoTestData(): Promise<{ added: number; skipped: number }> {
  const seeds = buildDemoTestItems();
  const existingIds = new Set((await readLocalCache()).map((item) => item.id));
  const toAdd = seeds.filter((item) => !existingIds.has(item.id));

  for (const item of toAdd) {
    await addDemoItem(item);
  }

  return { added: toAdd.length, skipped: seeds.length - toAdd.length };
}

export async function clearDemoItems(): Promise<void> {
  const cached = await readLocalCache();

  if (isSyncEnabled()) {
    try {
      const remote = await fetchSyncItemsIfChanged<MindtaskerItem>(null);
      if (remote.changed) {
        for (const item of remote.snapshot.items) {
          try {
            await hardDeleteSyncItem(item.id);
          } catch {
            await deleteSyncItem(item.id).catch(() => undefined);
          }
        }
      }
    } catch {
      for (const item of cached) {
        try {
          await hardDeleteSyncItem(item.id);
        } catch {
          await deleteSyncItem(item.id).catch(() => undefined);
        }
      }
    }
  }

  await writeLocalCache([]);
  knownSyncVersion = null;
  invalidateConvexMirrorCache();
}

export async function clearDemoSeedItems(): Promise<number> {
  const cached = await readLocalCache();
  const seeds = cached.filter((item) => isDemoSeedItemId(item.id));
  const rest = cached.filter((item) => !isDemoSeedItemId(item.id));

  if (isSyncEnabled()) {
    for (const item of seeds) {
      try {
        await hardDeleteSyncItem(item.id);
      } catch {
        await deleteSyncItem(item.id).catch(() => undefined);
      }
    }
  }

  await writeLocalCache(rest);
  return seeds.length;
}

export async function addDemoItem(item: MindtaskerItem): Promise<MindtaskerItem[]> {
  const items = [item, ...(await readLocalCache())];
  await writeLocalCache(items);

  if (isSyncEnabled()) {
    try {
      const { version } = await createSyncItem(buildSyncItem(item));
      knownSyncVersion = version;
      await mirrorItemToConvex(item);
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync add failed, kept locally", error);
      throw new Error(
        error instanceof Error
          ? `${error.message} (${getSyncApiBase()})`
          : `סנכרון נכשל (${getSyncApiBase()})`,
      );
    }
  }

  return items;
}

export async function updateDemoItem(
  id: string,
  patch: Partial<MindtaskerItem>,
): Promise<MindtaskerItem[]> {
  const items = (await readLocalCache()).map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  await writeLocalCache(items);

  if (isSyncEnabled()) {
    try {
      const { version } = await patchSyncItem(id, buildSyncPatch(patch));
      knownSyncVersion = version;
      const updated = items.find((entry) => entry.id === id);
      if (updated) await mirrorItemToConvex(updated);
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync patch failed, kept locally", error);
      throw new Error(
        error instanceof Error
          ? `${error.message} (${getSyncApiBase()})`
          : `סנכרון נכשל (${getSyncApiBase()})`,
      );
    }
  }

  return items;
}

export async function removeDemoItem(id: string): Promise<MindtaskerItem[]> {
  const items = (await readLocalCache()).filter((item) => item.id !== id);
  await writeLocalCache(items);

  if (isSyncEnabled()) {
    try {
      const { version } = await deleteSyncItem(id);
      knownSyncVersion = version;
      scheduleResyncAllItemsToConvex();
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync delete failed, kept locally", error);
      throw new Error(
        error instanceof Error
          ? `${error.message} (${getSyncApiBase()})`
          : `סנכרון נכשל (${getSyncApiBase()})`,
      );
    }
  }

  return items;
}

function toTrashItem(item: MindtaskerItem): TrashItem | null {
  if (!item.deleted_at || item.deleted_at < trashCutoffIso()) return null;
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    deleted_at: item.deleted_at,
    is_actionable: item.is_actionable,
    status: item.status,
  };
}

export async function getDemoTrashItems(): Promise<TrashItem[]> {
  if (isSyncEnabled()) {
    try {
      const items = await fetchSyncTrash<MindtaskerItem>();
      return items
        .map((item) => toTrashItem(item))
        .filter((item): item is TrashItem => item !== null);
    } catch (error) {
      console.warn("Sync trash fetch failed, using local cache", error);
    }
  }

  const cached = await readLocalCache();
  return cached
    .map((item) => toTrashItem(item))
    .filter((item): item is TrashItem => item !== null)
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

export async function restoreDemoTrashItem(id: string): Promise<void> {
  const items = await readLocalCache();
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error("Item not found");
  await updateDemoItem(id, resolveRestoreFromTrashPatch(item));
}

export async function permanentlyDeleteDemoItem(id: string): Promise<void> {
  if (isSyncEnabled()) {
    try {
      await hardDeleteSyncItem(id);
      return;
    } catch (error) {
      console.warn("Sync permanent delete failed, removing locally", error);
    }
  }

  const items = (await readLocalCache()).filter((item) => item.id !== id);
  await writeLocalCache(items);
}
