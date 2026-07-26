import type { MindtaskerItem } from "../types";
import { SOURCE_ICONS, SOURCE_LABELS, type SourceType } from "../lib/source-display";
import { resolveItemSource } from "../lib/item-source";
import { useSourceMaterial } from "../hooks/useSourceMaterial";
import { HighlightedNotebookImage } from "./HighlightedNotebookImage";

interface SourceMaterialModalProps {
  item: MindtaskerItem;
  onClose: () => void;
}

function SourceTypeHeading({ type }: { type: SourceType }) {
  return (
    <span>
      {SOURCE_ICONS[type]} {SOURCE_LABELS[type]}
    </span>
  );
}

export function SourceMaterialModal({ item, onClose }: SourceMaterialModalProps) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="source-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="source-modal-title" className="text-sm font-bold">
            מקור המידע
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="border border-slate-300 hover:bg-slate-50"
          >
            סגור
          </button>
        </div>

        <p className="mb-1 font-medium text-slate-800">{item.title}</p>

        {loading && !source ? (
          <p className="text-sm text-slate-500">טוען חומר מקור...</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <SourceTypeHeading type={displayType} />
            </p>

            {isVoice && mediaUrl ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">הקלטה מקורית</p>
                <audio controls src={mediaUrl} className="w-full" />
              </div>
            ) : isVoice && !mediaUrl ? (
              <p className="text-xs text-slate-500">אין קובץ אודיו זמין — מוצג התמלול בלבד.</p>
            ) : null}

            {isOcr && mediaUrl ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                  תמונת המחברת {source?.metadata?.ocr_lines?.length ? "— שורות מודגשות" : ""}
                </p>
                {source?.metadata?.ocr_lines?.length ? (
                  <HighlightedNotebookImage
                    src={mediaUrl}
                    lines={source.metadata.ocr_lines}
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="סריקת מחברת"
                    className="max-h-32 w-full rounded-lg object-contain"
                  />
                )}
              </div>
            ) : null}

            {rawText ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">טקסט מקורי / תמלול</p>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700">{rawText}</pre>
              </div>
            ) : (
              <p className="text-xs text-slate-500">אין טקסט מקורי שמור לפריט זה.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
