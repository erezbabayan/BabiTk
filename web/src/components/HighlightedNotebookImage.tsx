import type { OcrLine } from "../types";

interface HighlightedNotebookImageProps {
  src: string;
  lines: OcrLine[];
  alt?: string;
}

export function HighlightedNotebookImage({
  src,
  lines,
  alt = "סריקת מחברת",
}: HighlightedNotebookImageProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-slate-100">
      <img src={src} alt={alt} className="block max-h-24 w-full object-contain" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {lines.map((line, index) => (
          <div
            key={`${line.text}-${index}`}
            className={`absolute rounded border-2 ${
              line.completed
                ? "border-emerald-500 bg-emerald-400/25"
                : "border-amber-400 bg-amber-300/30"
            }`}
            style={{
              left: `${line.bbox.left * 100}%`,
              top: `${line.bbox.top * 100}%`,
              width: `${line.bbox.width * 100}%`,
              height: `${line.bbox.height * 100}%`,
            }}
            title={line.text}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-amber-400 bg-amber-300/40" />
          פתוח
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-emerald-500 bg-emerald-400/30" />
          בוצע
        </span>
      </div>
    </div>
  );
}
