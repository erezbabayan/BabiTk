import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ensureBrowserNotificationPermission } from "../lib/reminder-chime";

type ViewerPrefs = {
  userId: Id<"users">;
  notifyInApp: boolean;
  notifyWhatsApp: boolean;
  notifyWhatsAppGroup: boolean;
  notifyOverdueReminders: boolean;
  overdueFirstHours: number;
  overdueRepeatHours: number;
  phoneVerified: boolean;
  whatsappDigestHours: number[];
  whatsappCaptureGroupChatId: string | null;
  whatsappCaptureGroupName: string | null;
};

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
  _id: Id<"notifications">;
  title: string;
  body: string;
  read: boolean;
};

export function NotificationPrefs() {
  const viewer = useQuery(api.users.viewer) as ViewerPrefs | null | undefined;
  const updateNotificationPrefs = useMutation(api.users.updateNotificationPrefs);
  const recent = useQuery(
    api.notifications.listMine,
    viewer?.userId ? { userId: viewer.userId, limit: 8 } : "skip",
  ) as RecentNotification[] | undefined;
  const [browserPermission, setBrowserPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  if (viewer === undefined) {
    return <p className="text-sm text-slate-500">טוען…</p>;
  }

  if (!viewer) {
    return <p className="text-sm text-slate-500">לא ניתן לטעון העדפות התראות.</p>;
  }

  return (
    <div className="space-y-4" dir="rtl">
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
            checked={viewer.notifyInApp}
            onChange={(event) => {
              void updateNotificationPrefs({ notifyInApp: event.target.checked });
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
              checked={viewer.notifyOverdueReminders}
              onChange={(event) => {
                void updateNotificationPrefs({
                  notifyOverdueReminders: event.target.checked,
                });
              }}
            />
          </label>

          {viewer.notifyOverdueReminders ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
              <label className="text-right">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  התראה ראשונה אחרי
                </span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                  value={viewer.overdueFirstHours}
                  onChange={(event) => {
                    void updateNotificationPrefs({
                      overdueFirstHours: Number(event.target.value),
                    });
                  }}
                >
                  {[
                    ...new Set([...OVERDUE_HOUR_OPTIONS, viewer.overdueFirstHours]),
                  ]
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
                  value={viewer.overdueRepeatHours}
                  onChange={(event) => {
                    void updateNotificationPrefs({
                      overdueRepeatHours: Number(event.target.value),
                    });
                  }}
                >
                  {[
                    ...new Set([...OVERDUE_HOUR_OPTIONS, viewer.overdueRepeatHours]),
                  ]
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
                viewer.phoneVerified ? "text-slate-800" : "text-slate-400"
              }`}
            >
              התראות WhatsApp
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {viewer.phoneVerified
                ? `שליחה לטלפון המאומת כשמגיע מועד התזכורת, וסיכום יומי ב־${viewer.whatsappDigestHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")} (בהגדרות וואטסאפ)`
                : "דורש טלפון מאומת בהגדרות וואטסאפ"}
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={viewer.notifyWhatsApp}
            disabled={!viewer.phoneVerified}
            onChange={(event) => {
              void updateNotificationPrefs({ notifyWhatsApp: event.target.checked });
            }}
          />
        </label>

        <label className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-right">
            <span
              className={`block text-sm ${
                viewer.phoneVerified && viewer.whatsappCaptureGroupChatId
                  ? "text-slate-800"
                  : "text-slate-400"
              }`}
            >
              תזכורות משימה לקבוצת וואטסאפ
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {!viewer.phoneVerified
                ? "דורש טלפון מאומת בהגדרות וואטסאפ"
                : !viewer.whatsappCaptureGroupChatId
                  ? "דורש קבוצת קליטה מוגדרת בהגדרות וואטסאפ"
                  : `כשמגיע מועד תזכורת — שליחה לקבוצה «${viewer.whatsappCaptureGroupName?.trim() || "קבוצת הקליטה"}»`}
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={viewer.notifyWhatsAppGroup}
            disabled={!viewer.phoneVerified || !viewer.whatsappCaptureGroupChatId}
            onChange={(event) => {
              void updateNotificationPrefs({
                notifyWhatsAppGroup: event.target.checked,
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
                key={row._id}
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
