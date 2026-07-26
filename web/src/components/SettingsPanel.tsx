import { useState } from "react";

import { AdminUsersPanel } from "./AdminUsersPanel";
import { BoardSettingsPanel } from "./BoardSettingsPanel";
import { GoogleCalendarLink } from "./GoogleCalendarLink";
import { NotebookScanSettings } from "./NotebookScanSettings";
import { PhoneLinkSettings } from "./PhoneLinkSettings";
import { PremiumSettings } from "./PremiumSettings";
import { TagSettings } from "./TagSettings";
import { TextCaptureSettings } from "./TextCaptureSettings";
import { TrashSettings } from "./TrashSettings";
import { UserSettings } from "./UserSettings";
import { VoiceRecordingSettings } from "./VoiceRecordingSettings";
import { NotificationPrefs } from "./NotificationPrefs";
import type { UsageSummary } from "../lib/api";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { isDemoMode } from "../lib/supabase";

type SettingsSection =
  | "menu"
  | "user"
  | "notifications"
  | "whatsapp"
  | "voice"
  | "notebook"
  | "text"
  | "calendar"
  | "premium"
  | "tags"
  | "trash"
  | "boards"
  | "admin";

interface SettingsPanelProps {
  userId: string;
  summary: UsageSummary | null;
  onOpenPaywall: () => void;
  onClose: () => void;
}

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

const MENU_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "user", label: "👤 משתמש" },
  { id: "notifications", label: "🔔 התראות" },
  { id: "whatsapp", label: "💬 וואטסאפ — בחירת קבוצה" },
  { id: "voice", label: "🎙 הקלטה קולית" },
  { id: "notebook", label: "📷 סריקת מחברת" },
  { id: "text", label: "✏️ קליטת טקסט" },
  { id: "calendar", label: "📅 Google Calendar" },
  { id: "premium", label: "⭐ Premium" },
  { id: "tags", label: "🏷 ניהול תגיות" },
  { id: "boards", label: "📋 הגדרות בורדים" },
  { id: "trash", label: "🗑 סל מחזור" },
];

function OfflineNotice({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {children}
    </p>
  );
}

export function SettingsPanel({ userId, summary, onOpenPaywall, onClose }: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>("menu");
  const showNotifications = !OFFLINE && shouldUseConvexAuthLogin();
  // Offline mode: no Convex provider — never call useQuery here.
  const isAdmin = false;

  const menuItems = (showNotifications
    ? MENU_ITEMS
    : MENU_ITEMS.filter((item) => item.id !== "notifications")
  ).concat(isAdmin ? [{ id: "admin" as const, label: "🛡 ניהול משתמשים" }] : []);

  function handleOpenPaywall() {
    onClose();
    onOpenPaywall();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-sm font-bold">
            {section === "menu"
              ? "הגדרות"
              : section === "boards"
                ? "הגדרות בורדים"
                : section === "notifications"
                  ? "התראות"
                  : MENU_ITEMS.find((item) => item.id === section)?.label ??
                    (section === "admin" ? "🛡 ניהול משתמשים" : "")}
          </h2>
          <div className="flex gap-2">
            {section !== "menu" ? (
              <button
                type="button"
                onClick={() => setSection("menu")}
                className="border border-slate-300 hover:bg-slate-50"
              >
                חזור
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="border border-slate-300 hover:bg-slate-50"
            >
              סגור
            </button>
          </div>
        </div>

        {section === "menu" ? (
          <div className="divide-y divide-slate-100">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className="w-full py-3 text-right text-sm text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {section === "user" ? (
          OFFLINE ? (
            <OfflineNotice>
              מצב מקומי ללא Convex — הנתונים נשמרים בדפדפן בלבד. אין סנכרון ענן או פרופיל שרת.
            </OfflineNotice>
          ) : (
            <UserSettings />
          )
        ) : null}
        {section === "notifications" && showNotifications ? <NotificationPrefs /> : null}
        {section === "whatsapp" ? (
          OFFLINE ? (
            <OfflineNotice>
              חיבור WhatsApp דורש Convex פעיל. במצב מקומי אפשר לערוך פריטים שנשמרו בדפדפן בלבד.
            </OfflineNotice>
          ) : (
            <PhoneLinkSettings userId={userId} summary={summary} />
          )
        ) : null}
        {section === "voice" ? <VoiceRecordingSettings summary={summary} /> : null}
        {section === "notebook" ? <NotebookScanSettings summary={summary} /> : null}
        {section === "text" ? <TextCaptureSettings summary={summary} /> : null}
        {section === "calendar" ? (
          OFFLINE ? (
            <OfflineNotice>Google Calendar לא זמין במצב מקומי ללא Convex.</OfflineNotice>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">חבר את Google Calendar כדי לסנכרן משימות עם היומן.</p>
              <GoogleCalendarLink />
            </div>
          )
        ) : null}
        {section === "premium" ? (
          <PremiumSettings summary={summary} onOpenPaywall={handleOpenPaywall} />
        ) : null}
        {section === "tags" ? <TagSettings active /> : null}
        {section === "boards" ? <BoardSettingsPanel /> : null}
        {section === "trash" ? <TrashSettings userId={userId} /> : null}
        {section === "admin" && isAdmin ? <AdminUsersPanel /> : null}
      </div>
    </div>
  );
}
