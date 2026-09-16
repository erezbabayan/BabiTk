import { isForcedLocalMode, retryCloudBackend } from "../lib/supabase";

export function LocalBackendBanner() {
  if (!isForcedLocalMode()) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
      dir="rtl"
    >
      <p className="font-medium">
        עובדים במצב מקומי — הנתונים נשמרים בדפדפן זה בלבד (בלי סנכרון בין מכשירים).
      </p>
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-sky-800 underline"
        onClick={() => retryCloudBackend()}
      >
        חזרה ל-Supabase
      </button>
    </div>
  );
}
