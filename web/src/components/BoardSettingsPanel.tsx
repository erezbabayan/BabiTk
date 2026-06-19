import { useState } from "react";
import { BOARD_SETTINGS_LABELS } from "../lib/board-settings";
import { useBoardSettings } from "../hooks/useBoardSettings";
import { NotebookBoardSettings } from "./NotebookBoardSettings";

type BoardSection = "menu" | "inbox" | "today" | "notes";

const BOARD_MENU: { id: BoardSection; label: string }[] = [
  { id: "inbox", label: `📓 ${BOARD_SETTINGS_LABELS.inbox}` },
  { id: "today", label: `✅ ${BOARD_SETTINGS_LABELS.today}` },
  { id: "notes", label: `📝 ${BOARD_SETTINGS_LABELS.notes}` },
];

export function BoardSettingsPanel() {
  const { settings, loading, save } = useBoardSettings();
  const [section, setSection] = useState<BoardSection>("menu");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveInboxArchive(hours: number) {
    setSaving(true);
    setError(null);
    try {
      await save({ inbox_archive_hours: hours as typeof settings.inbox_archive_hours });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const title =
    section === "menu"
      ? "הגדרות בורדים"
      : BOARD_MENU.find((item) => item.id === section)?.label.replace(/^[^\s]+\s/, "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        {section !== "menu" ? (
          <button
            type="button"
            onClick={() => setSection("menu")}
            className="border border-slate-300 text-xs hover:bg-slate-50"
          >
            חזור לבורדים
          </button>
        ) : null}
      </div>

      {section === "menu" ? (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {BOARD_MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className="w-full px-3 py-3 text-right text-sm text-slate-700 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {section === "inbox" ? (
        <NotebookBoardSettings
          hours={settings.inbox_archive_hours}
          loading={loading}
          saving={saving}
          error={error}
          onSave={handleSaveInboxArchive}
        />
      ) : null}

      {section === "today" || section === "notes" ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          אין הגדרות נוספות לבורד זה כרגע.
        </p>
      ) : null}
    </div>
  );
}
