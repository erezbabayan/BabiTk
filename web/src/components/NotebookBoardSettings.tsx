import { INBOX_ARCHIVE_HOURS_OPTIONS } from "../lib/board-settings";

interface NotebookBoardSettingsProps {
  hours: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSave: (hours: number) => void;
}

export function NotebookBoardSettings({
  hours,
  loading,
  saving,
  error,
  onSave,
}: NotebookBoardSettingsProps) {
  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        פריטים שלא נוגעים בהם במחברת יעברו אוטומטית לארכיון לאחר פרק הזמן שתבחר.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">מעבר לארכיון אוטומטי</p>
        {INBOX_ARCHIVE_HOURS_OPTIONS.map((option) => {
          const selected = hours === option.hours;
          return (
            <button
              key={option.hours}
              type="button"
              disabled={saving}
              onClick={() => onSave(option.hours)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right disabled:opacity-60 ${
                selected
                  ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full border ${
                  selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                }`}
                aria-hidden
              />
              <span className="flex-1 pr-3 text-sm text-slate-700">{option.label}</span>
            </button>
          );
        })}
      </div>

      {saving ? <p className="text-xs text-slate-500">שומר...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
