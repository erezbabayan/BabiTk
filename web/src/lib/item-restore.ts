import type { ItemStatus, MindtaskerItem } from "../types";

export const PRE_ARCHIVE_STATUS = "pre_archive_status";
export const PRE_DELETE_STATUS = "pre_delete_status";
export const PRE_DELETE_COMPLETED_AT = "pre_delete_completed_at";

const RESTORABLE_FROM_ARCHIVE = new Set<ItemStatus>(["inbox", "pending"]);
const RESTORABLE_FROM_TRASH = new Set<ItemStatus>([
  "inbox",
  "pending",
  "completed",
  "snoozed_archive",
]);

type ItemSnapshot = Pick<MindtaskerItem, "status" | "is_actionable" | "completed_at" | "metadata"> & {
  deleted_at?: string | null;
};

function withoutKeys(meta: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...meta };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

export function buildArchivePatch(item: ItemSnapshot): Partial<MindtaskerItem> {
  return {
    status: "snoozed_archive",
    metadata: {
      ...(item.metadata ?? {}),
      [PRE_ARCHIVE_STATUS]: item.status,
    },
    last_interacted_at: new Date().toISOString(),
  };
}

export function resolveRestoreFromArchivePatch(item: ItemSnapshot): Partial<MindtaskerItem> {
  const rawMeta = item.metadata ?? {};
  const saved = rawMeta[PRE_ARCHIVE_STATUS] as ItemStatus | undefined;
  const metadata = withoutKeys(rawMeta, [PRE_ARCHIVE_STATUS]);

  let status: ItemStatus;
  if (saved && RESTORABLE_FROM_ARCHIVE.has(saved)) {
    status = saved;
  } else {
    status = item.is_actionable ? "inbox" : "pending";
  }

  return {
    status,
    metadata,
    completed_at: null,
    last_interacted_at: new Date().toISOString(),
  };
}

export function buildSoftDeletePatch(item: ItemSnapshot): Partial<MindtaskerItem> {
  const metadata = { ...(item.metadata ?? {}) };
  if (!item.deleted_at) {
    metadata[PRE_DELETE_STATUS] = item.status;
    if (item.status === "completed" && item.completed_at) {
      metadata[PRE_DELETE_COMPLETED_AT] = item.completed_at;
    }
  }

  return {
    deleted_at: new Date().toISOString(),
    metadata,
    last_interacted_at: new Date().toISOString(),
  };
}

export function resolveRestoreFromTrashPatch(item: ItemSnapshot): Partial<MindtaskerItem> {
  const rawMeta = item.metadata ?? {};
  const savedStatus = rawMeta[PRE_DELETE_STATUS] as ItemStatus | undefined;
  const savedCompleted = rawMeta[PRE_DELETE_COMPLETED_AT] as string | undefined;
  const metadata = withoutKeys(rawMeta, [PRE_DELETE_STATUS, PRE_DELETE_COMPLETED_AT]);

  const patch: Partial<MindtaskerItem> = {
    deleted_at: null,
    metadata,
    last_interacted_at: new Date().toISOString(),
  };

  if (savedStatus && RESTORABLE_FROM_TRASH.has(savedStatus)) {
    patch.status = savedStatus;
    if (savedStatus === "completed" && savedCompleted) {
      patch.completed_at = savedCompleted;
    } else if (savedStatus !== "completed") {
      patch.completed_at = null;
    }
  }

  return patch;
}
