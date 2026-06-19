import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { MindtaskerItem } from "../types";
import { getItemAnalysis } from "../lib/item-analysis";
import { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";
import { ItemAnalysisPanel } from "./ItemAnalysisPanel";
import { DueDateFields } from "./DueDateFields";

export interface ItemEditInput {
  title: string;
  content: string;
  tags: string[];
  due_date: string | null;
}

const FIELD_CLASS =
  "w-full !rounded-md !border-slate-300 bg-white !px-2.5 !py-1.5 !text-[13px] !leading-snug text-slate-900 shadow-sm outline-none transition focus:!border-blue-400 focus:!ring-1 focus:!ring-blue-100";

function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className={`${FIELD_CLASS} min-h-[4.5rem] resize-none`}
    />
  );
}

interface ItemEditModalProps {
  item: MindtaskerItem;
  onClose: () => void;
  onSave: (input: ItemEditInput) => void | Promise<void>;
}

export function ItemEditModal({ item, onClose, onSave }: ItemEditModalProps) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [tagsText, setTagsText] = useState(item.tags.join(", "));
  const [dueParts, setDueParts] = useState<DueDateParts>(() => splitDueDate(item.due_date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysis = getItemAnalysis(item.metadata);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("כותרת חובה");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: trimmedTitle,
        content: content.trim(),
        tags: parseTagsInput(tagsText),
        due_date: item.is_actionable ? combineDueDate(dueParts) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center sm:p-3"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(78vh,520px)] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:max-h-[min(72vh,480px)] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-edit-title"
      >
        <div className="border-b border-slate-100 px-3 py-2 sm:px-4">
          <h2 id="item-edit-title" className="text-center text-sm font-bold text-slate-900">
            עריכת {item.is_actionable ? "משימה" : "הערה"}
          </h2>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 sm:px-4"
        >
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">כותרת</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={FIELD_CLASS}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">תוכן</label>
              <AutoTextarea value={content} onChange={setContent} placeholder="הוסף פרטים, הערות או תיאור..." />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">
                תגיות (מופרדות בפסיק)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className={FIELD_CLASS}
                placeholder="עבודה, דחוף"
              />
            </div>
            {item.is_actionable ? <DueDateFields value={dueParts} onChange={setDueParts} /> : null}
            {analysis ? <ItemAnalysisPanel analysis={analysis} /> : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>

          <div className="mt-3 flex shrink-0 gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 !rounded-md border border-slate-300 !px-2.5 !py-1.5 !text-xs !font-semibold !leading-normal text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex-1 !rounded-md bg-blue-600 !px-2.5 !py-1.5 !text-xs !font-semibold !leading-normal text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
