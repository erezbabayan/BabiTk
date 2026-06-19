import { useState } from "react";
import { GoogleCalendarLink } from "./GoogleCalendarLink";
import { NotebookScanSettings } from "./NotebookScanSettings";
import { PhoneLinkSettings } from "./PhoneLinkSettings";
import { PremiumSettings } from "./PremiumSettings";
import { TagSettings } from "./TagSettings";
import { TextCaptureSettings } from "./TextCaptureSettings";
import { TrashSettings } from "./TrashSettings";
import { UserSettings } from "./UserSettings";
import { VoiceRecordingSettings } from "./VoiceRecordingSettings";
import { useUserTags } from "../hooks/useUserTags";
import type { UsageSummary } from "../lib/api";

type SettingsSection =
  | "menu"
  | "user"
  | "whatsapp"
  | "voice"
  | "notebook"
  | "text"
  | "calendar"
  | "premium"
  | "tags"
  | "trash";

interface SettingsPanelProps {
  userId: string;
  summary: UsageSummary | null;
  onOpenPaywall: () => void;
  onClose: () => void;
}

const MENU_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "user", label: "👤 משתמש" },
  { id: "whatsapp", label: "💬 וואטסאפ" },
  { id: "voice", label: "🎙 הקלטה קולית" },
  { id: "notebook", label: "📷 סריקת מחברת" },
  { id: "text", label: "✏️ קליטת טקסט" },
  { id: "calendar", label: "📅 Google Calendar" },
  { id: "premium", label: "⭐ Premium" },
  { id: "tags", label: "🏷 ניהול תגיות" },
  { id: "trash", label: "🗑 סל מחזור" },
];

export function SettingsPanel({ userId, summary, onOpenPaywall, onClose }: SettingsPanelProps) {
  const { tags, save } = useUserTags();
  const [section, setSection] = useState<SettingsSection>("menu");

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
            {section === "menu" ? "הגדרות" : MENU_ITEMS.find((item) => item.id === section)?.label}
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
            {MENU_ITEMS.map((item) => (
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

        {section === "user" ? <UserSettings /> : null}
        {section === "whatsapp" ? (
          <PhoneLinkSettings userId={userId} summary={summary} />
        ) : null}
        {section === "voice" ? <VoiceRecordingSettings summary={summary} /> : null}
        {section === "notebook" ? <NotebookScanSettings summary={summary} /> : null}
        {section === "text" ? <TextCaptureSettings summary={summary} /> : null}
        {section === "calendar" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">חבר את Google Calendar כדי לסנכרן משימות עם היומן.</p>
            <GoogleCalendarLink />
          </div>
        ) : null}
        {section === "premium" ? (
          <PremiumSettings summary={summary} onOpenPaywall={handleOpenPaywall} />
        ) : null}
        {section === "tags" ? <TagSettings tags={tags} onSave={save} /> : null}
        {section === "trash" ? <TrashSettings /> : null}
      </div>
    </div>
  );
}
