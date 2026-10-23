import { useEffect, useState } from "react";

import {
  formatReminderTime,
  parseReminderTime,
  type NotebookReminderPrefs,
} from "../lib/notebook-reminder-prefs";
import {
  loadNotebookReminderPrefs,
  saveNotebookReminderPrefs,
} from "../lib/notebook-reminder-settings";

/** Daily WhatsApp reminder of items waiting in the notebook. */
export function NotebookReminderSettings() {
  const [prefs, setPrefs] = useState<NotebookReminderPrefs | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadNotebookReminderPrefs()
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) setPrefs(loaded);
        else setUnavailable(true);
      })
      .catch(() => {
        if (!cancelled) setError("טעינת הגדרות התזכורת נכשלה");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<NotebookReminderPrefs>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setPrefs(await saveNotebookReminderPrefs(patch));
      setSaved(true);
    } catch {
      setPrefs(previous);
      setError("שמירת התזכורת נכשלה — נסה שוב");
    } finally {
      setSaving(false);
    }
  }

  if (unavailable) return null;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="notebook-reminder-settings">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">תזכורת יומית על פריטים במחברת</p>
          <p className="text-xs text-slate-500">
            פעם ביום בוואטסאפ: כמה פריטים מחכים לטיפול. לא נשלח כשהמחברת ריקה.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs?.enabled ?? false}
          aria-label="תזכורת יומית על פריטים במחברת"
          disabled={!prefs || saving}
          onClick={() => prefs && void save({ enabled: !prefs.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            prefs?.enabled ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              prefs?.enabled ? "right-0.5" : "right-[1.375rem]"
            }`}
            aria-hidden
          />
        </button>
      </div>

      {prefs ? (
        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span>שעת התזכורת</span>
          <input
            type="time"
            dir="ltr"
            step={300}
            disabled={!prefs.enabled || saving}
            value={formatReminderTime(prefs.hour, prefs.minute)}
            onChange={(event) => {
              const parsed = parseReminderTime(event.target.value);
              if (parsed) void save(parsed);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
          />
        </label>
      ) : (
        <p className="text-xs text-slate-500">טוען...</p>
      )}

      {saving ? <p className="text-xs text-slate-500">שומר...</p> : null}
      {saved && !saving && !error ? <p className="text-xs text-emerald-700">נשמר · מסונכרן עם האפליקציה</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
