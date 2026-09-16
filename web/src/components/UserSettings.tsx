import { useEffect, useState } from "react";

import { getAuthAccountView, type AuthAccountView } from "../lib/user-profile";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function UserSettings() {
  const [account, setAccount] = useState<AuthAccountView | null>(null);
  const [loading, setLoading] = useState(true);

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
    </div>
  );
}
