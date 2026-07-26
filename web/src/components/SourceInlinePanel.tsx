import type { MindtaskerItem } from "../types";
import { SOURCE_ICONS, SOURCE_LABELS, type SourceType } from "../lib/source-display";
import { resolveItemSource } from "../lib/item-source";
import { useSourceMaterial } from "../hooks/useSourceMaterial";
import { HighlightedNotebookImage } from "./HighlightedNotebookImage";

interface SourceInlinePanelProps {
  item: MindtaskerItem;
  onClose: () => void;
}

export function SourceInlinePanel({ item, onClose }: SourceInlinePanelProps) {
  const resolved = resolveItemSource(item);
  const sourceId = item.source_material_id ?? item.source_materials?.id;
  const { material, mediaUrl, loading } = useSourceMaterial(
    sourceId,
    item.source_materials ?? resolved.material,
  );

  const source = material ?? item.source_materials ?? resolved.material;
  const displayType: SourceType = source?.source_type ?? resolved.type;
  const isVoice = displayType === "whatsapp_voice";
  const isOcr = displayType === "notebook_ocr" || displayType === "image";
  const rawText = source?.raw_text ?? resolved.rawText;

  return (
    <div className="mt-1 border-t border-slate-200/80 pt-1">
      <div className="mb-1 flex items-center justify-between gap-1">
        <p className="text-[10px] font-medium text-slate-600">
          {SOURCE_ICONS[displayType]} {SOURCE_LABELS[displayType]}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="!rounded-sm !px-1 !py-px !text-[10px] text-slate-600 hover:bg-slate-100"
          title="חזור לכרטיס"
          aria-label="חזור לכרטיס"
        >
          ← חזור
        </button>
      </div>

      {loading && !source ? (
        <p className="text-[10px] text-slate-500">טוען...</p>
      ) : (
        <div className="space-y-1.5">
          {isVoice && mediaUrl ? (
            <audio controls src={mediaUrl} className="h-7 w-full" />
          ) : isVoice && !mediaUrl ? (
            <p className="text-[10px] text-slate-500">אין קובץ אודיו — מוצג התמלול בלבד.</p>
          ) : null}

          {isOcr && mediaUrl ? (
            source?.metadata?.ocr_lines?.length ? (
              <HighlightedNotebookImage src={mediaUrl} lines={source.metadata.ocr_lines} />
            ) : (
              <img
                src={mediaUrl}
                alt="סריקת מחברת"
                className="max-h-24 w-full rounded object-contain"
              />
            )
          ) : null}

          {rawText ? (
            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-1.5 font-sans text-[10px] leading-snug text-slate-700">
              {rawText}
            </pre>
          ) : (
            <p className="text-[10px] text-slate-500">אין טקסט מקורי שמור.</p>
          )}
        </div>
      )}
    </div>
  );
}
