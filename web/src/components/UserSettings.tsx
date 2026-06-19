import { useEffect, useState } from "react";
import { getProfileApi, type UserProfile } from "../lib/api";

export function UserSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getProfileApi()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">לא ניתן לטעון את פרטי המשתמש.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-900">פרטי חשבון</p>
        <p className="mt-2 text-slate-700" dir="ltr">
          {profile.email}
        </p>
      </div>
    </div>
  );
}
