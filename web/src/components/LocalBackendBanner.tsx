import { FREE_BACKEND_OPTIONS } from "../lib/free-backends";
import { isForcedLocalMode, retryCloudBackend } from "../lib/supabase";

export function LocalBackendBanner() {
  if (!isForcedLocalMode()) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
      dir="rtl"
    >
      <p className="font-medium">
        עובדים במצב מקומי חינם — שרת Convex חסום בגלל מגבלת תוכנית Free. הנתונים
        נשמרים בדפדפן זה (בלי וואטסאפ וסנכרון בין מכשירים).
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
        חלופות חינמיות לענן:{" "}
        {FREE_BACKEND_OPTIONS.map((option, index) => (
          <span key={option.url}>
            {index > 0 ? " · " : null}
            <a
              className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-800"
              href={option.url}
              target="_blank"
              rel="noreferrer"
            >
              {option.name}
            </a>
          </span>
        ))}
      </p>
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-sky-800 underline"
        onClick={() => retryCloudBackend()}
      >
        נסה שוב את שרת Convex
      </button>
    </div>
  );
}
