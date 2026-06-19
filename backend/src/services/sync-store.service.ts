import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { buildSoftDeletePatch } from "../lib/item-restore.js";

export const SYNC_USER_ID = "00000000-0000-4000-8000-000000000001";

export interface SyncItem {
  id: string;
  user_id: string;
  source_material_id: string | null;
  source_materials?: {
    id: string;
    source_type: string;
    storage_url: string | null;
    raw_text: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  title: string;
  content: string;
  is_actionable: boolean;
  status: "inbox" | "pending" | "completed" | "snoozed_archive";
  due_date: string | null;
  completed_at: string | null;
  tags: string[];
  metadata?: Record<string, unknown>;
  sort_order: number;
  last_interacted_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SyncStoreState {
  version: number;
  items: SyncItem[];
}

const dataDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../data",
);
const dataFile = path.join(dataDir, "sync-items.json");

let cache: SyncStoreState | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function seedItems(): SyncItem[] {
  const ts = nowIso();
  const srcVoice = {
    id: "demo-src-voice-1",
    source_type: "whatsapp_voice",
    storage_url: null,
    raw_text: "היי, תזכיר לי להתקשר לרואה חשבון מחר בבוקר",
  };
  const srcText = {
    id: "demo-src-text-1",
    source_type: "whatsapp_text",
    storage_url: null,
    raw_text: "קוד כניסה לבניין: שער 4821#",
  };

  return [
    {
      id: "demo-inbox-1",
      user_id: SYNC_USER_ID,
      source_material_id: srcVoice.id,
      source_materials: srcVoice,
      title: "להתקשר לרואה חשבון",
      content: "לשאול על דוח שנתי 2025",
      is_actionable: true,
      status: "inbox",
      due_date: null,
      completed_at: null,
      tags: [],
      sort_order: 10,
      last_interacted_at: ts,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    },
    {
      id: "demo-inbox-2",
      user_id: SYNC_USER_ID,
      source_material_id: srcText.id,
      source_materials: srcText,
      title: "קוד כניסה לבניין",
      content: "קוד שער: 4821#",
      is_actionable: false,
      status: "inbox",
      due_date: null,
      completed_at: null,
      tags: ["בניין"],
      sort_order: 20,
      last_interacted_at: ts,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    },
    {
      id: "demo-task-1",
      user_id: SYNC_USER_ID,
      source_material_id: null,
      title: "לשלוח הצעת מחיר ללקוח",
      content: "כולל פירוט שעות פיתוח",
      is_actionable: true,
      status: "pending",
      due_date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      completed_at: null,
      tags: ["עבודה"],
      sort_order: 10,
      last_interacted_at: ts,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    },
    {
      id: "demo-note-1",
      user_id: SYNC_USER_ID,
      source_material_id: null,
      title: "רעיון לדשבורד",
      content: "3 עמודות: המחברת, משימות לביצוע, הערות — מסונכרן בין מחשב לטלפון",
      is_actionable: false,
      status: "pending",
      due_date: null,
      completed_at: null,
      tags: ["רעיונות"],
      sort_order: 10,
      last_interacted_at: ts,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    },
  ];
}

async function loadState(): Promise<SyncStoreState> {
  if (cache) return cache;

  try {
    const raw = await readFile(dataFile, "utf8");
    cache = JSON.parse(raw) as SyncStoreState;
    return cache;
  } catch {
    cache = { version: 1, items: seedItems() };
    await flushState();
    return cache;
  }
}

async function flushState(): Promise<void> {
  if (!cache) return;
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(cache), "utf8");
}

function persistState(): void {
  if (!cache) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushState();
  }, 150);
}

function bumpVersion(): void {
  if (!cache) return;
  cache.version += 1;
}

function activeItems(state: SyncStoreState): SyncItem[] {
  return state.items.filter((item) => !item.deleted_at);
}

export async function getSyncSnapshot(): Promise<{ version: number; items: SyncItem[] }> {
  const state = await loadState();
  return {
    version: state.version,
    items: activeItems(state),
  };
}

export async function getCurrentSyncVersion(): Promise<number> {
  const state = await loadState();
  return state.version;
}

export async function getSyncSnapshotIfChanged(
  sinceVersion: number,
): Promise<
  | { changed: false; version: number }
  | { changed: true; version: number; items: SyncItem[] }
> {
  const state = await loadState();
  if (sinceVersion === state.version) {
    return { changed: false, version: state.version };
  }
  return { changed: true, version: state.version, items: activeItems(state) };
}

export async function addSyncItem(item: SyncItem): Promise<SyncItem> {
  const state = await loadState();
  state.items.unshift(item);
  bumpVersion();
  persistState();
  return item;
}

export async function patchSyncItem(
  id: string,
  patch: Partial<SyncItem>,
): Promise<SyncItem | null> {
  const state = await loadState();
  let updated: SyncItem | null = null;

  state.items = state.items.map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      ...patch,
      id: item.id,
      user_id: item.user_id,
      updated_at: nowIso(),
    };
    return updated;
  });

  if (!updated) return null;
  bumpVersion();
  persistState();
  return updated;
}

export async function softDeleteSyncItem(id: string): Promise<boolean> {
  const state = await loadState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return false;
  const result = await patchSyncItem(id, buildSoftDeletePatch(item));
  return result !== null;
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function getSyncTrashItems(): Promise<SyncItem[]> {
  const state = await loadState();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  return state.items
    .filter((item) => item.deleted_at && item.deleted_at >= cutoff)
    .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
}

export async function hardDeleteSyncItem(id: string): Promise<boolean> {
  const state = await loadState();
  const before = state.items.length;
  state.items = state.items.filter((item) => item.id !== id);
  if (state.items.length === before) return false;
  bumpVersion();
  persistState();
  return true;
}

export async function purgeExpiredSyncItems(): Promise<number> {
  const state = await loadState();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  const before = state.items.length;
  state.items = state.items.filter(
    (item) => !item.deleted_at || item.deleted_at >= cutoff,
  );
  const removed = before - state.items.length;
  if (removed > 0) {
    bumpVersion();
    persistState();
  }
  return removed;
}

export function isSyncStoreEnabled(): boolean {
  return env.demoSyncEnabled;
}
