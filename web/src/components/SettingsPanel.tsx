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
import { ErrorBoundary } from "./ErrorBoundary";
import { UserSettings } from "./UserSettings";
import { VoiceRecordingSettings } from "./VoiceRecordingSettings";
import { NotificationPrefs } from "./NotificationPrefs";
import type { UsageSummary } from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";

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
  onUsageChanged?: () => void;
  /** When true, User / WhatsApp / Calendar use the Supabase cloud account. */
  cloudAccount?: boolean;
  initialSection?: SettingsSection;
}

function hasCloudAccount(cloudAccount: boolean | undefined): boolean {
  return cloudAccount ?? isSupabaseConfigured;
}

const MENU_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "user", label: "👤 משתמש" },
  { id: "notifications", label: "🔔 התראות" },
  { id: "whatsapp", label: "💬 וואטסאפ — חיבור" },
  { id: "voice", label: "🎙 הקלטה קולית" },
  { id: "notebook", label: "📷 סריקת מחברת" },
  { id: "text", label: "✏️ קליטת טקסט" },
  { id: "calendar", label: "📅 Google Calendar" },
  { id: "premium", label: "⭐ מנוי" },
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

export function SettingsPanel({
  userId,
  summary,
  onOpenPaywall: _onOpenPaywall,
  onClose,
  onUsageChanged,
  cloudAccount,
  initialSection = "menu",
}: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const isAdmin = false;
  const cloudBackend = hasCloudAccount(cloudAccount);
  const showNotifications = cloudBackend;

  const menuItems = (showNotifications
    ? MENU_ITEMS
    : MENU_ITEMS.filter((item) => item.id !== "notifications")
  ).concat(isAdmin ? [{ id: "admin" as const, label: "🛡 ניהול משתמשים" }] : []);

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
          cloudBackend ? (
            <ErrorBoundary
              fallback={
                <p className="text-sm text-slate-500">
                  לא ניתן לטעון את הגדרות המשתמש. רעננו את הדף ונסו שוב.
                </p>
              }
            >
              <UserSettings />
            </ErrorBoundary>
          ) : (
            <OfflineNotice>
              מצב מקומי — הנתונים נשמרים בדפדפן בלבד. אין סנכרון ענן או פרופיל שרת.
            </OfflineNotice>
          )
        ) : null}
        {section === "notifications" && showNotifications ? (
          cloudBackend ? (
            <NotificationPrefs />
          ) : (
            <OfflineNotice>התראות חיות דורשות חשבון ענן.</OfflineNotice>
          )
        ) : null}
        {section === "whatsapp" ? (
          cloudBackend ? (
            <PhoneLinkSettings userId={userId} summary={summary} />
          ) : (
            <OfflineNotice>
              חיבור WhatsApp דורש חשבון ענן. במצב מקומי אפשר לערוך פריטים שנשמרו בדפדפן בלבד.
            </OfflineNotice>
          )
        ) : null}
        {section === "voice" ? <VoiceRecordingSettings summary={summary} /> : null}
        {section === "notebook" ? <NotebookScanSettings summary={summary} /> : null}
        {section === "text" ? <TextCaptureSettings summary={summary} /> : null}
        {section === "calendar" ? (
          cloudBackend ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                משימות עם תאריך נכנסות ליומן Google. הערות בלי תאריך נשארות רק ב-BabiTk.
              </p>
              <GoogleCalendarLink />
            </div>
          ) : (
            <OfflineNotice>Google Calendar לא זמין במצב מקומי ללא חשבון ענן.</OfflineNotice>
          )
        ) : null}
        {section === "premium" ? (
          <PremiumSettings summary={summary} onChanged={onUsageChanged} />
        ) : null}
        {section === "tags" ? <TagSettings active /> : null}
        {section === "boards" ? <BoardSettingsPanel /> : null}
        {section === "trash" ? <TrashSettings userId={userId} /> : null}
        {section === "admin" && isAdmin ? <AdminUsersPanel /> : null}
      </div>
    </div>
  );
}
