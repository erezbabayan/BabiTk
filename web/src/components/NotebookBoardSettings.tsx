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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">מעבר לארכיון אוטומטי</legend>
        {INBOX_ARCHIVE_HOURS_OPTIONS.map((option) => (
          <label
            key={option.hours}
            className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
          >
            <input
              type="radio"
              name="inbox-archive-hours"
              checked={hours === option.hours}
              disabled={saving}
              onChange={() => onSave(option.hours)}
              className="h-4 w-4"
            />
            <span className="flex-1 pr-3 text-right text-sm text-slate-700">{option.label}</span>
          </label>
        ))}
      </fieldset>

      {saving ? <p className="text-xs text-slate-500">שומר...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
