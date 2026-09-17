import { useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import { requireSupabase } from "../lib/supabase";
import { getAuthAccountView, type AuthAccountView } from "../lib/user-profile";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function UserSettings() {
  const [account, setAccount] = useState<AuthAccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAuthAccountView()
      .then((view) => {
        if (!cancelled) setAccount(view);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  if (!account?.email) {
    return (
      <p className="text-sm text-slate-500">
        לא ניתן לטעון את פרטי החשבון. התחברו מחדש ואז פתחו שוב את הגדרות המשתמש.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-900">פרטי חשבון</p>
        {account.displayName ? (
          <p className="mt-2 text-slate-800">{account.displayName}</p>
        ) : null}
        {account.username ? (
          <p className="mt-1 text-slate-700" dir="ltr">
            {account.username}
          </p>
        ) : null}
        <p className="mt-1 text-slate-700" dir="ltr">
          {account.email}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <ChangePasswordForm email={account.email} />
      </div>

      <div className="rounded-xl border border-slate-200 p-4 text-sm" dir="rtl">
        <p className="font-medium text-slate-900">נתונים וחשבון</p>
        <p className="mt-1 text-xs text-slate-500">
          ייצוא מוריד JSON של הפריטים והפרופיל. מחיקה מוחקת את החשבון וכל הנתונים.
        </p>
        {message ? <p className="mt-2 text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-2 text-red-600">{error}</p> : null}
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                setMessage(null);
                try {
                  const data = await apiFetch<unknown>("/api/profile/export");
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `babitk-export-${new Date().toISOString().slice(0, 10)}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                  setMessage("הקובץ הורד.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "הייצוא נכשל");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            ייצוא הנתונים שלי
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
            onClick={() => {
              void (async () => {
                const confirmed = window.confirm(
                  "למחוק את החשבון וכל הנתונים? הפעולה לא ניתנת לביטול.",
                );
                if (!confirmed) return;
                setBusy(true);
                setError(null);
                setMessage(null);
                try {
                  await apiFetch("/api/profile", { method: "DELETE" });
                  await requireSupabase().auth.signOut();
                  window.location.reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "מחיקת החשבון נכשלה");
                  setBusy(false);
                }
              })();
            }}
          >
            מחק חשבון
          </button>
        </div>
      </div>
    </div>
  );
}
