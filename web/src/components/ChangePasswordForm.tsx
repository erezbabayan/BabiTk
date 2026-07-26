import { FormEvent, useState } from "react";
import { useAction } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { changePasswordWithSupabase } from "../lib/change-password";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";
import { PasswordInput } from "./PasswordInput";

interface ChangePasswordFormProps {
  email: string | null;
}

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const changePasswordConvex = useAction(api.account.changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const convexAuth = shouldUseConvexAuthLogin();
  const supabaseAuth = isSupabaseConfigured;
  const canChangePassword = convexAuth || supabaseAuth;

  if (!canChangePassword) {
    return null;
  }

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
      if (convexAuth) {
        await changePasswordConvex({
          currentPassword,
          newPassword,
        });
      } else if (supabaseAuth) {
        await changePasswordWithSupabase(
          requireSupabase(),
          email,
          currentPassword,
          newPassword,
        );
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
      <p className="text-sm font-medium text-slate-900">שינוי סיסמה</p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">סיסמה נוכחית</span>
        <PasswordInput
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          required
        />
      </label>

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
        {loading ? "שומר..." : "עדכן סיסמה"}
      </button>
    </form>
  );
}
