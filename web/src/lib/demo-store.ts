import type { MindtaskerItem } from "../types";
import { mirrorItemToConvex } from "./convex-mirror";
import { resolveRestoreFromTrashPatch } from "./item-restore";
import {
  createSyncItem,
  deleteSyncItem,
  fetchSyncItemsIfChanged,
  fetchSyncTrash,
  hardDeleteSyncItem,
  isSyncEnabled,
  patchSyncItem,
} from "./sync-client";
import { trashCutoffIso, type TrashItem } from "./trash";

const STORAGE_KEY = "mindtasker:demo:items";
const PREMIUM_KEY = "mindtasker:demo:premium";
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

let knownSyncVersion: number | null = null;

export function invalidateSyncCache(): void {
  knownSyncVersion = null;
}

export function isDemoPremium(): boolean {
  return localStorage.getItem(PREMIUM_KEY) === "true";
}

export function setDemoPremium(premium: boolean): void {
  if (premium) {
    localStorage.setItem(PREMIUM_KEY, "true");
  } else {
    localStorage.removeItem(PREMIUM_KEY);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSyncItem(item: MindtaskerItem): Record<string, unknown> {
  const now = nowIso();
  return {
    id: item.id,
    user_id: item.user_id ?? DEMO_USER_ID,
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
    sort_order: item.sort_order ?? Date.now(),
    last_interacted_at: item.last_interacted_at ?? now,
    created_at: item.created_at ?? now,
    updated_at: item.updated_at ?? now,
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

function readLocalItems(): MindtaskerItem[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MindtaskerItem[];
  } catch {
    return [];
  }
}

function writeLocalItems(items: MindtaskerItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function getDemoItems(): Promise<MindtaskerItem[]> {
  const snapshot = await getDemoItemsSnapshot();
  return snapshot.items;
}

export async function getDemoItemsSnapshot(
  version: number | null = knownSyncVersion,
): Promise<{ items: MindtaskerItem[]; version: number | null; changed: boolean }> {
  if (isSyncEnabled()) {
    try {
      const result = await fetchSyncItemsIfChanged<MindtaskerItem>(version);
      if (!result.changed) {
        const local = readLocalItems().filter((item) => !item.deleted_at);
        if (local.length === 0 && version !== null) {
          knownSyncVersion = null;
          return getDemoItemsSnapshot(null);
        }
        return {
          items: local,
          version: result.version,
          changed: local.length > 0,
        };
      }
      knownSyncVersion = result.snapshot.version;
      writeLocalItems(result.snapshot.items);
      return {
        items: result.snapshot.items,
        version: result.snapshot.version,
        changed: true,
      };
    } catch (error) {
      console.warn("Sync fetch failed, using local cache", error);
      const cached = readLocalItems();
      if (cached.length > 0) {
        return {
          items: cached.filter((item) => !item.deleted_at),
          version,
          changed: false,
        };
      }
    }
  }

  const items = readLocalItems().filter((item) => !item.deleted_at);
  return { items, version: null, changed: true };
}

export async function addDemoItem(item: MindtaskerItem): Promise<MindtaskerItem[]> {
  const items = [item, ...readLocalItems()];
  writeLocalItems(items);

  if (isSyncEnabled()) {
    try {
      const { version } = await createSyncItem(buildSyncItem(item));
      knownSyncVersion = version;
      void mirrorItemToConvex(item);
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync add failed, saving locally", error);
    }
  }

  return items;
}

export async function updateDemoItem(
  id: string,
  patch: Partial<MindtaskerItem>,
): Promise<MindtaskerItem[]> {
  const items = readLocalItems().map((item) =>
    item.id === id ? { ...item, ...patch, updated_at: nowIso() } : item,
  );
  writeLocalItems(items);
  const merged = items.find((item) => item.id === id);

  if (isSyncEnabled()) {
    try {
      const { version } = await patchSyncItem(id, buildSyncPatch(patch));
      knownSyncVersion = version;
      if (merged) void mirrorItemToConvex(merged);
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync patch failed, saving locally", error);
    }
  }

  return items.filter((entry) => !entry.deleted_at);
}

export async function removeDemoItem(id: string): Promise<MindtaskerItem[]> {
  const items = readLocalItems().filter((item) => item.id !== id);
  writeLocalItems(items);

  if (isSyncEnabled()) {
    try {
      const { version } = await deleteSyncItem(id);
      knownSyncVersion = version;
      return items.filter((entry) => !entry.deleted_at);
    } catch (error) {
      console.warn("Sync delete failed, saving locally", error);
    }
  }

  return items;
}

export async function searchDemoNotes(query: string): Promise<MindtaskerItem[]> {
  const q = query.trim().toLowerCase();
  const items = await getDemoItems();
  return items.filter(
    (item) =>
      !item.is_actionable &&
      item.status === "pending" &&
      (item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))),
  );
}

function readAllLocalItems(): MindtaskerItem[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MindtaskerItem[];
  } catch {
    return [];
  }
}

function toTrashItem(item: MindtaskerItem & { deleted_at?: string | null }): TrashItem | null {
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
      const items = await fetchSyncTrash<MindtaskerItem & { deleted_at: string }>();
      return items
        .map((item) => toTrashItem(item))
        .filter((item): item is TrashItem => item !== null);
    } catch (error) {
      console.warn("Sync trash fetch failed, using local cache", error);
    }
  }

  return readAllLocalItems()
    .map((item) => toTrashItem(item))
    .filter((item): item is TrashItem => item !== null)
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

export async function restoreDemoTrashItem(id: string): Promise<void> {
  const item = readAllLocalItems().find((entry) => entry.id === id);
  if (!item) throw new Error("Item not found");
  await updateDemoItem(id, resolveRestoreFromTrashPatch(item));
}

export async function permanentlyDeleteDemoItem(id: string): Promise<void> {
  if (isSyncEnabled()) {
    try {
      await hardDeleteSyncItem(id);
      knownSyncVersion = null;
      return;
    } catch (error) {
      console.warn("Sync permanent delete failed, removing locally", error);
    }
  }

  writeLocalItems(readAllLocalItems().filter((item) => item.id !== id));
}
