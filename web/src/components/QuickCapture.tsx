import { FormEvent, useState } from "react";
import { ingestTextApi } from "../lib/api";
import { isDemoMode } from "../lib/supabase";
import { invalidateSyncCache } from "../lib/demo-store";
import { resyncAllItemsToConvex } from "../lib/convex-mirror";
import { ingestTextSync } from "../lib/sync-client";
import { MindTaskerLogo } from "./MindTaskerLogo";

interface QuickCaptureProps {
  onCaptured?: () => void;
}

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

export function QuickCapture({ onCaptured }: QuickCaptureProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) return;

    setLoading(true);
    setError(null);

    try {
      if (isDemoMode) {
        await ingestTextSync({
          text: trimmed,
          sourceType: "whatsapp_text",
          timezone: clientTimezone(),
        });
        invalidateSyncCache();
        await resyncAllItemsToConvex();
      } else {
        await ingestTextApi(trimmed);
      }
      setText("");
      onCaptured?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בקליטה");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = text.trim().length >= 3;

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full rounded-full border border-slate-300 bg-white p-0.5 shadow-sm focus-within:outline-none"
    >
      <div className="flex h-10 items-center gap-1">
        <button
          type="submit"
          disabled={loading || !canSubmit}
          aria-label="קלוט"
          title="קלוט"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm outline-none hover:from-slate-50 hover:to-slate-200 focus:outline-none disabled:opacity-45"
        >
          {loading ? (
            <span className="text-[10px] text-slate-500">...</span>
          ) : (
            <MindTaskerLogo size="capture" variant="mark" />
          )}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="קליטה מהירה — טקסט או רעיון..."
          dir="rtl"
          className="min-w-0 flex-1 !rounded-none !border-0 bg-transparent py-1 pr-2 pl-0.5 text-right text-[11px] leading-tight shadow-none outline-none focus:!border-0 focus:outline-none focus:ring-0"
          aria-label="קליטה מהירה"
        />
      </div>
      {error ? <p className="px-2 pb-1 text-[10px] text-red-600">{error}</p> : null}
    </form>
  );
}
