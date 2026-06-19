import { useEffect, useState } from "react";
import { DEFAULT_USER_TAGS } from "../lib/tags";
import type { UserTag } from "../lib/tags";

const PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
  "#64748b",
];

interface TagSettingsProps {
  tags: UserTag[];
  onSave: (tags: { name: string; color: string }[]) => Promise<void>;
}

export function TagSettings({ tags, onSave }: TagSettingsProps) {
  const [draft, setDraft] = useState(() =>
    (tags.length > 0 ? tags : DEFAULT_USER_TAGS.map((tag, index) => ({
      id: `new-${index}`,
      name: tag.name,
      color: tag.color,
      sort_order: index,
    }))).map((tag) => ({ name: tag.name, color: tag.color })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      (tags.length > 0 ? tags : DEFAULT_USER_TAGS.map((tag, index) => ({
        id: `new-${index}`,
        name: tag.name,
        color: tag.color,
        sort_order: index,
      }))).map((tag) => ({ name: tag.name, color: tag.color })),
    );
  }, [tags]);

  function updateTag(index: number, patch: Partial<{ name: string; color: string }>) {
    setDraft((current) =>
      current.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)),
    );
  }

  function addTag() {
    if (draft.length >= 20) return;
    setDraft((current) => [
      ...current,
      { name: "", color: PALETTE[current.length % PALETTE.length]! },
    ]);
  }

  function removeTag(index: number) {
    if (draft.length <= 1) return;
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    const cleaned = draft
      .map((tag) => ({ name: tag.name.trim(), color: tag.color }))
      .filter((tag) => tag.name.length > 0);

    if (cleaned.length === 0) {
      setError("נדרשת לפחות תגית אחת");
      return;
    }

    const names = cleaned.map((tag) => tag.name);
    if (new Set(names).size !== names.length) {
      setError("יש תגיות עם שמות כפולים");
      return;
    }

    setSaving(true);
    try {
      await onSave(cleaned);
      setMessage("התגיות נשמרו — ה-AI ישתמש בהן לפריטים חדשים");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">תגיות מותאמות</h3>
        <p className="mt-1 text-xs text-slate-500">
          הגדר תגיות וצבעים. המערכת תשייך אותן אוטומטית לפריטים חדשים לפי ניתוח ה-AI.
        </p>
      </div>

      <div className="space-y-2">
        {draft.map((tag, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="color"
              value={tag.color}
              onChange={(e) => updateTag(index, { color: e.target.value })}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-300 p-0.5"
              aria-label={`צבע לתגית ${index + 1}`}
            />
            <input
              type="text"
              value={tag.name}
              onChange={(e) => updateTag(index, { name: e.target.value })}
              placeholder="שם תגית"
              className="min-w-0 flex-1 py-1"
            />
            <button
              type="button"
              onClick={() => removeTag(index)}
              disabled={draft.length <= 1}
              className="shrink-0 border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              מחק
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addTag}
          disabled={draft.length >= 20}
          className="border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
        >
          + תגית
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "שומר..." : "שמור תגיות"}
        </button>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </section>
  );
}
