import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { getProfileApi, type UserProfile } from "../lib/api";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { writeCachedHeaderName } from "../lib/header-name-cache";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function UserSettings() {
  const viewer = useQuery(api.users.viewer);
  const updateDisplayName = useMutation(api.users.updateDisplayName);
  const convexAuth = shouldUseConvexAuthLogin();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(!convexAuth);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (convexAuth) return;
    void getProfileApi()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [convexAuth]);

  useEffect(() => {
    if (!convexAuth || !viewer) return;
    setFirstName(viewer.firstName?.trim() ?? "");
    setLastName(viewer.lastName?.trim() ?? "");
  }, [convexAuth, viewer?.firstName, viewer?.lastName]);

  const email = convexAuth ? (viewer?.email ?? null) : (profile?.email ?? null);

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameMessage(null);
    setSavingName(true);
    try {
      await updateDisplayName({ firstName: firstName.trim(), lastName: lastName.trim() });
      writeCachedHeaderName(
        { firstName: firstName.trim(), lastName: lastName.trim() },
        viewer?.userId,
      );
      setNameMessage("השם עודכן");
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "שמירת השם נכשלה");
    } finally {
      setSavingName(false);
    }
  }

  if (convexAuth && viewer === undefined) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  if (!convexAuth && loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  if (!email) {
    return <p className="text-sm text-slate-500">לא ניתן לטעון את פרטי המשתמש.</p>;
  }

  return (
    <div className="space-y-4">
      {convexAuth ? (
        <form
          onSubmit={(event) => void handleSaveName(event)}
          className="rounded-xl border border-slate-200 p-4"
        >
          <p className="mb-3 text-sm font-medium text-slate-900">שם מוצג בכותרת</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">שם פרטי</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">שם משפחה</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>
          {nameError ? <p className="mt-2 text-xs text-red-600">{nameError}</p> : null}
          {nameMessage ? <p className="mt-2 text-xs text-emerald-700">{nameMessage}</p> : null}
          <button
            type="submit"
            disabled={savingName}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {savingName ? "שומר..." : "שמור שם"}
          </button>
        </form>
      ) : null}

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
