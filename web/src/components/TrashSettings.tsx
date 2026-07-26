import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import {
  permanentDeleteConfirmMessage,
  permanentDeleteManyConfirmMessage,
} from "../lib/confirm-copy";
import { useConvexBackend } from "../lib/data-backend";
import { isDemoMode } from "../lib/supabase";
import {
  daysUntilTrashExpiry,
  formatDeletedAt,
  listTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
  TRASH_RETENTION_DAYS,
  type TrashItem,
} from "../lib/trash-api";

type TrashRow = {
  id: string;
  title: string;
  content: string;
  deleted_at: string;
  is_actionable: boolean;
  status: string;
};

type TrashSettingsProps = {
  userId?: string;
};

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

function TrashSettingsView({
  items,
  loading,
  error,
  busy,
  onRestore,
  onPurge,
}: {
  items: TrashRow[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  onRestore: (ids: string[]) => Promise<void>;
  onPurge: (ids: string[], confirmMessage: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((item) => item.id)));
  }

  async function restoreIds(ids: string[]) {
    await onRestore(ids);
    setSelected(new Set());
  }

  async function purgeIds(ids: string[], confirmMessage: string) {
    const ok = await requestConfirm({
      title: "מחיקה לצמיתות",
      message: confirmMessage,
      confirmLabel: "מחק לצמיתות",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    await onPurge(ids, confirmMessage);
    setSelected(new Set());
  }

  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  return (
    <div className="space-y-3">
      {confirmDialog}
      <p className="text-sm text-slate-600">
        פריטים שנמחקו נשמרים כאן למשך {TRASH_RETENTION_DAYS} יום, ואז נמחקים לצמיתות.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          סל המחזור ריק.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={toggleAll}
              className="border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {allSelected ? "בטל בחירה" : "בחר הכל"}
            </button>
            {selectedCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void restoreIds([...selected])}
                  className="border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  שחזר ({selectedCount})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void purgeIds(
                      [...selected],
                      permanentDeleteManyConfirmMessage(selectedCount),
                    )
                  }
                  className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  מחק לצמיתות ({selectedCount})
                </button>
              </div>
            ) : null}
          </div>

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((item) => {
              const daysLeft = daysUntilTrashExpiry(item.deleted_at);
              const isSelected = selected.has(item.id);
              return (
                <li key={item.id} className="space-y-2 p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={busy}
                      onChange={() => toggleOne(item.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      {item.content ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {item.content}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">
                        נמחק {formatDeletedAt(item.deleted_at)}
                        {daysLeft > 0 ? ` · נמחק לצמיתות בעוד ${daysLeft} ימים` : ""}
                      </p>
                    </div>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void restoreIds([item.id])}
                      className="border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      שחזר
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void purgeIds(
                          [item.id],
                          permanentDeleteConfirmMessage(item.title),
                        )
                      }
                      className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      מחק לצמיתות
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function TrashSettingsOffline(_props: TrashSettingsProps) {
  const [legacyItems, setLegacyItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLegacy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLegacyItems(await listTrashItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
      setLegacyItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLegacy();
  }, [refreshLegacy]);

  const restoreIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        for (const id of ids) {
          await restoreTrashItem(id);
        }
        await refreshLegacy();
      } catch (err) {
        setError(err instanceof Error ? err.message : "שחזור נכשל");
      } finally {
        setBusy(false);
      }
    },
    [refreshLegacy],
  );

  const purgeIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        for (const id of ids) {
          await permanentlyDeleteTrashItem(id);
        }
        await refreshLegacy();
      } catch (err) {
        setError(err instanceof Error ? err.message : "מחיקה נכשלה");
      } finally {
        setBusy(false);
      }
    },
    [refreshLegacy],
  );

  return (
    <TrashSettingsView
      items={legacyItems}
      loading={loading}
      error={error}
      busy={busy}
      onRestore={restoreIds}
      onPurge={async (ids) => purgeIds(ids)}
    />
  );
}

function TrashSettingsOnline({ userId }: TrashSettingsProps) {
  const convexBackend = useConvexBackend();
  const convexUserId = userId as Id<"users"> | undefined;
  const nowMs = useMemo(() => Date.now(), []);
  const convexItems = useQuery(
    api.items.listTrash,
    convexBackend && convexUserId ? { userId: convexUserId, nowMs } : "skip",
  );
  const restoreMutation = useMutation(api.items.restoreFromTrash);
  const purgeMutation = useMutation(api.items.permanentlyDeleteFromTrash);

  const [legacyItems, setLegacyItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(!convexBackend);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLegacy = useCallback(async () => {
    if (convexBackend) return;
    setLoading(true);
    setError(null);
    try {
      setLegacyItems(await listTrashItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
      setLegacyItems([]);
    } finally {
      setLoading(false);
    }
  }, [convexBackend]);

  useEffect(() => {
    void refreshLegacy();
  }, [refreshLegacy]);

  const items: TrashRow[] = useMemo(() => {
    if (convexBackend) {
      return (convexItems ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        deleted_at: new Date(row.deletedAt).toISOString(),
        is_actionable: row.isActionable,
        status: row.status,
      }));
    }
    return legacyItems;
  }, [convexBackend, convexItems, legacyItems]);

  const restoreIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        if (convexBackend && convexUserId) {
          await restoreMutation({ userId: convexUserId, itemIds: ids });
        } else {
          for (const id of ids) {
            await restoreTrashItem(id);
          }
          await refreshLegacy();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "שחזור נכשל");
      } finally {
        setBusy(false);
      }
    },
    [convexBackend, convexUserId, refreshLegacy, restoreMutation],
  );

  const purgeIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        if (convexBackend && convexUserId) {
          await purgeMutation({ userId: convexUserId, itemIds: ids });
        } else {
          for (const id of ids) {
            await permanentlyDeleteTrashItem(id);
          }
          await refreshLegacy();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "מחיקה נכשלה");
      } finally {
        setBusy(false);
      }
    },
    [convexBackend, convexUserId, purgeMutation, refreshLegacy],
  );

  const showLoading = convexBackend ? convexItems === undefined : loading;

  return (
    <TrashSettingsView
      items={items}
      loading={showLoading}
      error={error}
      busy={busy}
      onRestore={restoreIds}
      onPurge={async (ids) => purgeIds(ids)}
    />
  );
}

export const TrashSettings = OFFLINE ? TrashSettingsOffline : TrashSettingsOnline;
