import { useEffect, useState } from "react";

import { ensureBrowserNotificationPermission } from "../lib/reminder-chime";
import { requireSupabase } from "../lib/supabase";
import {
  getCloudUserProfile,
  updateCloudUserProfile,
  type CloudUserProfile,
} from "../lib/user-profile";

const OVERDUE_HOUR_OPTIONS = [1, 3, 6, 12, 24, 36, 48, 72, 96, 120, 168] as const;

function formatHoursLabel(hours: number): string {
  if (hours < 24) return `${hours} שעות`;
  const days = hours / 24;
  if (Number.isInteger(days)) {
    return days === 1 ? "יום אחד" : `${days} ימים`;
  }
  return `${hours} שעות`;
}

type RecentNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
};

type NotifyPatch = Partial<
  Pick<
    CloudUserProfile,
    | "notify_in_app"
    | "notify_browser"
    | "notify_whatsapp"
    | "notify_whatsapp_group"
    | "notify_overdue_reminders"
    | "overdue_first_hours"
    | "overdue_repeat_hours"
  >
>;

export function NotificationPrefs() {
  const [profile, setProfile] = useState<CloudUserProfile | null>(null);
  const [recent, setRecent] = useState<RecentNotification[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  useEffect(() => {
    let cancelled = false;
    void getCloudUserProfile()
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "לא ניתן לטעון העדפות התראות.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        const { data, error: queryError } = await requireSupabase()
          .from("user_notifications")
          .select("id, title, body, read")
          .order("fire_at", { ascending: false })
          .limit(8);
        if (queryError) throw queryError;
        if (!cancelled) {
          setRecent(
            (data ?? []).map((row) => ({
              id: String(row.id),
              title: String(row.title ?? ""),
              body: String(row.body ?? ""),
              read: row.read === true,
            })),
          );
        }
      } catch {
        if (!cancelled) setRecent([]);
      }
    }
    void loadRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  async function patchPrefs(patch: NotifyPatch) {
    setError(null);
    const next = await updateCloudUserProfile(patch);
    setProfile(next);
  }

  if (error && !profile) {
    return <p className="text-sm text-slate-500">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">טוען…</p>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-900">התראות</p>

        <label className="flex items-start justify-between gap-3">
          <span className="text-right">
            <span className="block text-sm text-slate-800">מרכז התראות (פעמון)</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              תזכורות בפעמון במערכת (Web) ובאפליקציה — כולל חלון קופץ וצליל
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={profile.notify_in_app}
            onChange={(event) => {
              void patchPrefs({ notify_in_app: event.target.checked }).catch((err) => {
                setError(err instanceof Error ? err.message : "שמירה נכשלה");
              });
            }}
          />
        </label>

        {browserPermission !== "unsupported" ? (
          <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
            <span className="text-right">
              <span className="block text-sm text-slate-800">התראות דפדפן (Windows)</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {browserPermission === "granted"
                  ? "מאושר — התזכורת תופיע גם מחוץ לחלון המערכת"
                  : browserPermission === "denied"
                    ? "חסום בדפדפן — אפשר לאשר בהגדרות האתר"
                    : "לאפשר התראה במגש המערכת של Windows"}
              </span>
            </span>
            {browserPermission !== "granted" && browserPermission !== "denied" ? (
              <button
                type="button"
                className="shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                onClick={() => {
                  void ensureBrowserNotificationPermission().then((ok) => {
                    setBrowserPermission(ok ? "granted" : Notification.permission);
                    if (ok) {
                      void patchPrefs({ notify_browser: true });
                    }
                  });
                }}
              >
                אשר
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="flex items-start justify-between gap-3">
            <span className="text-right">
              <span className="block text-sm text-slate-800">
                תזכורת חוזרת לפריטים שעבר זמנם
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                פריט שמועד ההתראה שלו עבר ועדיין פתוח
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={profile.notify_overdue_reminders}
              onChange={(event) => {
                void patchPrefs({ notify_overdue_reminders: event.target.checked }).catch(
                  (err) => {
                    setError(err instanceof Error ? err.message : "שמירה נכשלה");
                  },
                );
              }}
            />
          </label>

          {profile.notify_overdue_reminders ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
              <label className="text-right">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  התראה ראשונה אחרי
                </span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                  value={profile.overdue_first_hours}
                  onChange={(event) => {
                    void patchPrefs({
                      overdue_first_hours: Number(event.target.value),
                    }).catch((err) => {
                      setError(err instanceof Error ? err.message : "שמירה נכשלה");
                    });
                  }}
                >
                  {[...new Set([...OVERDUE_HOUR_OPTIONS, profile.overdue_first_hours])]
                    .sort((a, b) => a - b)
                    .map((hours) => (
                      <option key={`first-${hours}`} value={hours}>
                        {formatHoursLabel(hours)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-right">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  ואז כל
                </span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                  value={profile.overdue_repeat_hours}
                  onChange={(event) => {
                    void patchPrefs({
                      overdue_repeat_hours: Number(event.target.value),
                    }).catch((err) => {
                      setError(err instanceof Error ? err.message : "שמירה נכשלה");
                    });
                  }}
                >
                  {[...new Set([...OVERDUE_HOUR_OPTIONS, profile.overdue_repeat_hours])]
                    .sort((a, b) => a - b)
                    .map((hours) => (
                      <option key={`repeat-${hours}`} value={hours}>
                        {formatHoursLabel(hours)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <label className="flex items-start justify-between gap-3">
          <span className="text-right">
            <span
              className={`block text-sm ${
                profile.phone_verified ? "text-slate-800" : "text-slate-400"
              }`}
            >
              התראות WhatsApp
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {profile.phone_verified
                ? `שליחה לטלפון המאומת כשמגיע מועד התזכורת, וסיכום יומי ב־${profile.whatsapp_digest_hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")} (בהגדרות וואטסאפ)`
                : "דורש טלפון מאומת בהגדרות וואטסאפ"}
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={profile.notify_whatsapp}
            disabled={!profile.phone_verified}
            onChange={(event) => {
              void patchPrefs({ notify_whatsapp: event.target.checked }).catch((err) => {
                setError(err instanceof Error ? err.message : "שמירה נכשלה");
              });
            }}
          />
        </label>

        <label className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-right">
            <span
              className={`block text-sm ${
                profile.phone_verified && profile.whatsapp_capture_group_chat_id
                  ? "text-slate-800"
                  : "text-slate-400"
              }`}
            >
              תזכורות משימה לקבוצת וואטסאפ
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {!profile.phone_verified
                ? "דורש טלפון מאומת בהגדרות וואטסאפ"
                : !profile.whatsapp_capture_group_chat_id
                  ? "דורש קבוצת קליטה מוגדרת בהגדרות וואטסאפ"
                  : `כשמגיע מועד תזכורת — שליחה לקבוצה «${profile.whatsapp_capture_group_name?.trim() || "קבוצת הקליטה"}». בקבוצה אפשר לכתוב «תפריט» לשאלות מובנות.`}
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={profile.notify_whatsapp_group}
            disabled={!profile.phone_verified || !profile.whatsapp_capture_group_chat_id}
            onChange={(event) => {
              void patchPrefs({ notify_whatsapp_group: event.target.checked }).catch((err) => {
                setError(err instanceof Error ? err.message : "שמירה נכשלה");
              });
            }}
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-2 text-sm font-medium text-slate-900">אחרונות בפעמון</p>
        {recent === undefined ? (
          <p className="text-xs text-slate-500">טוען…</p>
        ) : recent.length === 0 ? (
          <p className="text-xs text-slate-500">אין התראות עדיין</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((row) => (
              <li
                key={row.id}
                className={`rounded-lg border px-3 py-2 text-right text-xs ${
                  row.read
                    ? "border-slate-200 bg-white"
                    : "border-indigo-200 bg-indigo-50"
                }`}
              >
                <p className="font-semibold text-slate-900">{row.title}</p>
                <p className="mt-0.5 text-slate-600">{row.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
