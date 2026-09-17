import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { MindtaskerItem } from "../types";
import { getItemAnalysis } from "../lib/item-analysis";
import { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";
import { effectiveTaskDueDate, getReminderFlags, getReminderRecurrence, type ReminderRecurrence } from "../lib/resolve-item-reminder";
import {
  isVoicePendingText,
  isVoicePlaceholderText,
  resolveVoiceDisplayText,
} from "../lib/voice-text";
import { ItemAnalysisPanel } from "./ItemAnalysisPanel";
import { DueDateFields } from "./DueDateFields";
import { ReminderRecurrenceChips } from "./ReminderRecurrenceChips";
import { ItemTagSelect } from "./ItemTagSelect";
import { useUserTags } from "../hooks/useUserTags";
import { alignItemTagsWithDefinitions } from "../lib/tags";
import { ensureBrowserNotificationPermission } from "../lib/reminder-chime";
import { recordIngestCorrectionApi } from "../lib/api";
import {
  newChecklistEntry,
  parseChecklist,
  type ChecklistEntry,
} from "../lib/checklist";

export interface ItemEditInput {
  title: string;
  content: string;
  tags: string[];
  due_date: string | null;
  recurrence?: ReminderRecurrence | null;
  checklist?: ChecklistEntry[];
}

const FIELD_CLASS =
  "w-full !rounded-md !border-slate-300 bg-white !px-2 !py-1 !text-[12px] !leading-tight text-slate-900 shadow-sm outline-none transition focus:!border-blue-400 focus:!ring-1 focus:!ring-blue-100";

function AutoTextarea({
  value,
  onChange,
  placeholder,
  expanded,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  expanded: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const maxHeight = expanded ? 420 : 200;
  const minHeight = expanded ? 160 : 32;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, el.scrollHeight))}px`;
  }, [value, maxHeight, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={expanded ? 8 : 2}
      className={`${FIELD_CLASS} resize-y overflow-y-auto ${
        expanded ? "min-h-40 max-h-[420px]" : "min-h-8 max-h-52"
      }`}
    />
  );
}

interface ItemEditModalProps {
  item: MindtaskerItem;
  onClose: () => void;
  onSave: (input: ItemEditInput) => void | Promise<void>;
}

export function ItemEditModal({ item, onClose, onSave }: ItemEditModalProps) {
  const { tags: userTags } = useUserTags();
  const resolved = resolveVoiceDisplayText(item);
  const [title, setTitle] = useState(resolved.transcribing ? "" : resolved.title);
  const [content, setContent] = useState(resolved.transcribing ? "" : resolved.content);
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags);
  const [dueParts, setDueParts] = useState<DueDateParts>(() => {
    if (getReminderFlags(item.metadata).disabled) {
      return splitDueDate(null);
    }
    return splitDueDate(effectiveTaskDueDate(item));
  });
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(() =>
    getReminderRecurrence(item.metadata),
  );
  const [checklist, setChecklist] = useState<ChecklistEntry[]>(() => parseChecklist(item.metadata));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const analysis = getItemAnalysis(item.metadata);

  useEffect(() => {
    const next = resolveVoiceDisplayText(item);
    if (next.transcribing) return;
    setTitle((current) =>
      isVoicePlaceholderText(current) || isVoicePendingText(current) || !current.trim()
        ? next.title
        : current,
    );
    setContent((current) =>
      isVoicePlaceholderText(current) || isVoicePendingText(current) || !current.trim()
        ? next.content
        : current,
    );
  }, [item]);

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
    if (isVoicePlaceholderText(trimmedTitle) || isVoicePendingText(trimmedTitle)) {
      setError("ההודעה הקולית עדיין בתמלול");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const dueDate = combineDueDate(dueParts);
      if (dueDate) {
        void ensureBrowserNotificationPermission();
      }
      const nextTags = alignItemTagsWithDefinitions(selectedTags, userTags);
      await onSave({
        title: trimmedTitle,
        content: content.trim(),
        tags: nextTags,
        due_date: dueDate,
        recurrence: dueDate ? recurrence : null,
        checklist: checklist
          .map((entry) => ({ ...entry, text: entry.text.trim() }))
          .filter((entry) => entry.text.length > 0),
      });
      const beforeTags = item.tags ?? [];
      const tagsChanged =
        beforeTags.length !== nextTags.length ||
        beforeTags.some((tag, index) => tag !== nextTags[index]);
      if (tagsChanged) {
        void recordIngestCorrectionApi({
          itemId: item.id,
          sourceText: `${item.title}\n${item.content}`.trim(),
          beforeTags,
          afterTags: nextTags,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[220] flex items-center justify-center bg-black/40 ${
        expanded ? "p-2 sm:p-4" : "p-2 sm:p-3"
      }`}
      onClick={() => {
        if (!saving) onClose();
      }}
      role="presentation"
    >
      <div
        className={`flex flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-[width,max-width,height] duration-200 ${
          expanded
            ? "h-[min(92vh,820px)] w-full max-w-2xl"
            : "w-full max-w-sm"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-edit-title"
      >
        <div className="relative shrink-0 border-b border-slate-100 px-3 py-1.5">
          <h2 id="item-edit-title" className="text-center text-xs font-bold text-slate-900">
            עריכת {item.is_actionable ? "משימה" : "הערה"}
          </h2>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            title={expanded ? "הקטן תצוגה" : "הגדל תצוגה"}
            aria-label={expanded ? "הקטן תצוגה" : "הגדל תצוגה"}
            aria-pressed={expanded}
          >
            {expanded ? "🗗" : "⛶"}
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-1.5"
        >
          <div
            className={`min-h-0 space-y-1 ${expanded ? "flex-1 overflow-y-auto pe-0.5" : ""}`}
          >
            <div>
              <label className="mb-px block text-[10px] font-medium text-slate-500">כותרת</label>
              {resolved.transcribing ? (
                <p className="mb-1 text-[10px] text-slate-500">ההודעה הקולית בתהליך תמלול…</p>
              ) : null}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={FIELD_CLASS}
                required
                autoFocus
              />
            </div>
            <div className={expanded ? "flex min-h-0 flex-col" : ""}>
              <label className="mb-px block text-[10px] font-medium text-slate-500">תוכן</label>
              <AutoTextarea
                value={content}
                onChange={setContent}
                placeholder="הוסף פרטים..."
                expanded={expanded}
              />
            </div>
            <div>
              <label className="mb-px block text-[10px] font-medium text-slate-500">תגיות</label>
              <ItemTagSelect
                userTags={userTags}
                selected={selectedTags}
                onChange={setSelectedTags}
              />
            </div>
            <DueDateFields value={dueParts} onChange={setDueParts} compact={!expanded} />
            <div>
              <div className="mb-px flex items-center justify-between">
                <label className="text-[10px] font-medium text-slate-500">רשימת משימות</label>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                  onClick={() => setChecklist((rows) => [...rows, newChecklistEntry("")])}
                >
                  + שורה
                </button>
              </div>
              {checklist.length === 0 ? (
                <p className="text-[10px] text-slate-400">אפשר לפצל את המשימה לשורות סימון</p>
              ) : (
                <ul className="space-y-1">
                  {checklist.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0"
                        checked={entry.done}
                        onChange={() => {
                          setChecklist((rows) =>
                            rows.map((row) =>
                              row.id === entry.id ? { ...row, done: !row.done } : row,
                            ),
                          );
                        }}
                      />
                      <input
                        type="text"
                        value={entry.text}
                        onChange={(event) => {
                          const text = event.target.value;
                          setChecklist((rows) =>
                            rows.map((row) => (row.id === entry.id ? { ...row, text } : row)),
                          );
                        }}
                        className={`${FIELD_CLASS} !py-0.5`}
                        placeholder="סעיף"
                      />
                      <button
                        type="button"
                        className="shrink-0 text-[11px] text-slate-400 hover:text-rose-600"
                        onClick={() =>
                          setChecklist((rows) => rows.filter((row) => row.id !== entry.id))
                        }
                        aria-label="מחק סעיף"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pt-0.5">
              <ReminderRecurrenceChips
                value={recurrence}
                onChange={setRecurrence}
                compact={!expanded}
              />
            </div>
            {analysis ? (
              <details className="rounded-md border border-slate-200 bg-slate-50/60">
                <summary className="cursor-pointer px-2 py-1 text-[10px] font-semibold text-slate-600">
                  ניתוח קליטה
                </summary>
                <div className="border-t border-slate-200 px-1 pb-1">
                  <ItemAnalysisPanel analysis={analysis} compact={!expanded} />
                </div>
              </details>
            ) : null}
            {error ? <p className="text-[10px] text-red-600">{error}</p> : null}
          </div>

          <div className="mt-1.5 flex shrink-0 gap-1.5 border-t border-slate-100 pt-1.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 !rounded-md border border-slate-300 !px-2 !py-1 !text-[11px] !font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex-1 !rounded-md bg-blue-600 !px-2 !py-1 !text-[11px] !font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
