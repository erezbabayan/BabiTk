import { FormEvent, useState } from "react";

import { changePasswordWithSupabase, setPasswordForSignedInUser } from "../lib/change-password";
import { requireSupabase } from "../lib/supabase";
import { PasswordInput } from "./PasswordInput";

interface ChangePasswordFormProps {
  email: string | null;
  /** Google-only accounts have no current password to verify. */
  hasPasswordLogin?: boolean;
}

export function ChangePasswordForm({
  email,
  hasPasswordLogin = true,
}: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!email) {
      setError("לא נמצא אימייל לחשבון");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("הסיסמאות החדשות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      if (hasPasswordLogin) {
        await changePasswordWithSupabase(
          requireSupabase(),
          email,
          currentPassword,
          newPassword,
        );
      } else {
        await setPasswordForSignedInUser(requireSupabase(), newPassword);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("הסיסמה עודכנה בהצלחה");
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הסיסמה נכשל");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <p className="text-sm font-medium text-slate-900">
        {hasPasswordLogin ? "שינוי סיסמה" : "הוסיפו סיסמה"}
      </p>
      {hasPasswordLogin ? null : (
        <p className="text-xs text-slate-500">
          נכנסתם עם Google. אפשר להוסיף סיסמה כדי להיכנס גם בלי Google.
        </p>
      )}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      {hasPasswordLogin ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">סיסמה נוכחית</span>
          <PasswordInput
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">סיסמה חדשה</span>
        <PasswordInput
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">אימות סיסמה חדשה</span>
        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "שומר..." : hasPasswordLogin ? "עדכן סיסמה" : "שמור סיסמה"}
      </button>
    </form>
  );
}
