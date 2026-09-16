import { useEffect, useState } from "react";

import { requireSupabase } from "../lib/supabase";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function UserSettings() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void requireSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
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

  if (!email) {
    return <p className="text-sm text-slate-500">לא ניתן לטעון את פרטי המשתמש.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-900">פרטי חשבון</p>
        <p className="mt-2 text-slate-700" dir="ltr">
          {email}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <ChangePasswordForm email={email} />
      </div>
    </div>
  );
}
