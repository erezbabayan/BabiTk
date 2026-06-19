import { useCallback, useEffect, useState } from "react";
import {
  daysUntilTrashExpiry,
  formatDeletedAt,
  listTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
  TRASH_RETENTION_DAYS,
  type TrashItem,
} from "../lib/trash-api";

export function TrashSettings() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listTrashItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreTrashItem(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שחזור נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!window.confirm("למחוק לצמיתות? לא ניתן לשחזר.")) return;
    setBusyId(id);
    setError(null);
    try {
      await permanentlyDeleteTrashItem(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        פריטים שנמחקו נשמרים כאן למשך {TRASH_RETENTION_DAYS} יום, ואז נמחקים לצמיתות.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          סל המחזור ריק.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((item) => {
            const busy = busyId === item.id;
            const daysLeft = daysUntilTrashExpiry(item.deleted_at);
            return (
              <li key={item.id} className="space-y-2 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  {item.content ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.content}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    נמחק {formatDeletedAt(item.deleted_at)}
                    {daysLeft > 0 ? ` · נמחק לצמיתות בעוד ${daysLeft} ימים` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestore(item.id)}
                    className="border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    שחזר
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePermanentDelete(item.id)}
                    className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    מחק לצמיתות
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
