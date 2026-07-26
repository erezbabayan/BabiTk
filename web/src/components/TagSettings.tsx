import { useUserTags } from "../hooks/useUserTags";
import { useTagSettingsDraft } from "../hooks/useTagSettingsDraft";
import { DEFAULT_USER_TAGS, MAX_USER_TAGS } from "../lib/tags";

interface TagSettingsProps {
  className?: string;
  active?: boolean;
}

export function TagSettings({ className, active = true }: TagSettingsProps = {}) {
  const { loading: tagsLoading } = useUserTags();
  const {
    draft,
    updateTag,
    removeTag,
    flushSave,
    resetToDefaults,
    filledCount,
    saving,
    loading,
    ready,
    error,
    synced,
  } = useTagSettingsDraft(active);

  if (!ready && (tagsLoading || loading)) {
    return (
      <section className={`space-y-3 border-t border-slate-200 pt-4${className ? ` ${className}` : ""}`}>
        <p className="text-xs text-slate-500">טוען תגיות...</p>
      </section>
    );
  }

  return (
    <section className={`space-y-3 border-t border-slate-200 pt-4${className ? ` ${className}` : ""}`}>
      <div>
        <h3 className="text-sm font-bold text-slate-800">תגיות מותאמות</h3>
        <p className="mt-1 text-xs text-slate-500">
          הגדר עד {MAX_USER_TAGS} תגיות וצבעים. שינויים נשמרים אוטומטית ומסתנכרנים עם הבורדים.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {filledCount}/{MAX_USER_TAGS} תגיות מוגדרות
          {saving ? " · שומר..." : synced ? " · מסונכרן" : " · ממתין לשמירה..."}
        </p>
      </div>

      <div className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
        {draft.map((tag, index) => {
          const empty = !tag.name.trim();
          return (
            <div
              key={index}
              className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${
                empty ? "border border-dashed border-slate-200 bg-slate-50/60" : ""
              }`}
            >
              <span className="w-5 shrink-0 text-center text-[10px] text-slate-400">{index + 1}</span>
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
                onBlur={() => void flushSave()}
                placeholder={`תגית ${index + 1}`}
                className="min-w-0 flex-1 py-1"
              />
              <button
                type="button"
                onClick={() => removeTag(index)}
                disabled={empty || filledCount <= 1}
                className="shrink-0 border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                מחק
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void flushSave()}
          disabled={saving}
          className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "שומר..." : "שמור עכשיו"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              !window.confirm(
                `לאפס ל-${DEFAULT_USER_TAGS.length} תגיות ברירת מחדל?\n(${DEFAULT_USER_TAGS.map((t) => t.name).join(", ")})\n\nהרשימה תתעדכן בכל הבורדים.`,
              )
            ) {
              return;
            }
            void resetToDefaults();
          }}
          disabled={saving}
          className="border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          איפוס לברירת מחדל
        </button>
      </div>
    </section>
  );
}
