import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TagChip } from "./TagChip";
import {
  MAX_ITEM_TAGS,
  MAX_USER_TAGS,
  TAG_PALETTE,
  colorForTag,
  formatTagLabel,
  normalizeTagName,
  tagWheelChipFill,
  tagWheelChipText,
  type UserTag,
} from "../lib/tags";
import {
  buildWheelSlots,
  CENTER_SIZE,
  CHIP_SIZE,
  DIAL_SIZE,
  slotPosition,
} from "../lib/tag-wheel-layout";
import { NotebookIcon } from "./NotebookIcons";

interface TagWheelPickerProps {
  visible: boolean;
  itemTitle: string;
  selectedTags: string[];
  userTags: UserTag[];
  onToggleTag: (tagName: string) => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}

export function TagWheelPicker({
  visible,
  itemTitle,
  selectedTags,
  userTags,
  onToggleTag,
  onCreateTag,
  onClose,
}: TagWheelPickerProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_PALETTE[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setNewName("");
      setNewColor(TAG_PALETTE[0]!);
      setError(null);
    }
  }, [visible]);

  const wheelSlots = useMemo(
    () => buildWheelSlots(userTags),
    [userTags],
  );

  const atLimit = selectedTags.length >= MAX_ITEM_TAGS;
  const canAddMoreTags = userTags.length < MAX_USER_TAGS;

  if (!visible) return null;

  async function handleCreate() {
    const trimmed = normalizeTagName(newName);
    if (!trimmed) {
      setError("שם תגית חובה");
      return;
    }
    if (userTags.some((t) => normalizeTagName(t.name) === trimmed)) {
      setError("תגית כבר קיימת");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreateTag(trimmed, newColor);
      if (!atLimit) onToggleTag(trimmed);
      setCreating(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת תגית נכשלה");
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setError(null);
    setNewColor(TAG_PALETTE[userTags.length % TAG_PALETTE.length]!);
    setCreating(true);
  }

  function handleTagPress(name: string) {
    const isSelected = selectedTags.includes(name);
    if (!isSelected && atLimit) return;
    onToggleTag(name);
  }

  return createPortal(
    <div
      className="tag-wheel-overlay fixed inset-0 z-[220] flex items-center justify-center p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="tag-wheel-panel flex h-[480px] w-full max-w-[300px] flex-col overflow-hidden px-4 pb-3 pt-4 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={itemTitle ? `תיוג — ${itemTitle}` : "תיוג פריט"}
      >
        <h3 className="font-hand mb-2 shrink-0 text-lg font-semibold text-stone-700">תיוג</h3>

        <div className="tag-wheel-body flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-2 flex shrink-0 justify-center">
            <div className="relative" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
              <div className="tag-wheel-dial absolute inset-0 rounded-full" aria-hidden />
              <div
                className="absolute rounded-full border border-stone-200/70 bg-[#fffefb]/80"
                style={{ left: 14, top: 14, width: DIAL_SIZE - 28, height: DIAL_SIZE - 28 }}
                aria-hidden
              />

              {wheelSlots.map((slot, index) => {
                const pos = slotPosition(index);
                if (slot.kind === "empty") {
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={openCreate}
                      disabled={!canAddMoreTags}
                      aria-label="תגית חדשה"
                      className={`absolute z-10 flex items-center justify-center rounded-full border border-dashed text-sm font-medium text-stone-600 transition hover:scale-[1.03] hover:bg-white/80 ${
                        !canAddMoreTags ? "opacity-45" : ""
                      }`}
                      style={{
                        left: pos.left,
                        top: pos.top,
                        width: CHIP_SIZE,
                        height: CHIP_SIZE,
                        borderColor: `${tagWheelChipFill(slot.hintColor)}cc`,
                        backgroundColor: tagWheelChipFill(slot.hintColor),
                      }}
                    >
                      <NotebookIcon name="plus" size={14} tone="muted" />
                    </button>
                  );
                }

                const selected = selectedTags.includes(slot.name);
                const chipFill = tagWheelChipFill(slot.color);
                const chipText = tagWheelChipText(slot.color);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleTagPress(slot.name)}
                    disabled={!selected && atLimit}
                    className={`absolute z-10 flex items-center justify-center overflow-hidden rounded-full border px-1 shadow-sm transition ${
                      selected ? "border-stone-500 ring-2 ring-stone-400/40" : "border-stone-200/80"
                    } ${!selected && atLimit ? "opacity-45" : ""}`}
                    style={{
                      left: pos.left,
                      top: pos.top,
                      width: CHIP_SIZE,
                      height: CHIP_SIZE,
                      backgroundColor: chipFill,
                    }}
                  >
                    <span
                      className="line-clamp-2 w-full px-0.5 text-center text-[7px] font-bold leading-[1.1]"
                      style={{ color: chipText }}
                    >
                      {formatTagLabel(slot.name)}
                    </span>
                  </button>
                );
              })}

              <div
                className="absolute z-20 flex items-center justify-center rounded-full border border-stone-200/90 bg-white shadow-sm"
                style={{
                  left: DIAL_SIZE / 2 - CENTER_SIZE / 2,
                  top: DIAL_SIZE / 2 - CENTER_SIZE / 2,
                  width: CENTER_SIZE,
                  height: CENTER_SIZE,
                }}
              >
                <NotebookIcon name="tag" size={14} tone="orange" />
              </div>
            </div>
          </div>

          <div className={`w-full shrink-0 ${creating ? "h-[148px]" : "h-0 overflow-hidden"}`}>
            {creating ? (
              <div className="space-y-2 text-right">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="שם תגית חדשה"
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
                  autoFocus
                />
                <div className="flex flex-wrap justify-center gap-2">
                  {TAG_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`h-6 w-6 rounded-full border border-stone-200/80 ${newColor === color ? "ring-2 ring-stone-600" : ""}`}
                      style={{ backgroundColor: color }}
                      aria-label={`צבע ${color}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="flex-1 rounded-lg border border-stone-200 bg-white py-2 text-sm text-stone-600 hover:bg-stone-50"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={saving}
                    className="flex-1 rounded-lg border border-orange-300 bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {saving ? "..." : "צור"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="mb-1 shrink-0 text-xs text-red-600">{error}</p> : null}

        <div className="tag-wheel-footer w-full shrink-0 px-2 py-2">
          <div className="flex min-h-8 flex-wrap items-center justify-center gap-1">
            {selectedTags.length === 0 ? (
              <span className="text-[11px] text-stone-400">בחר עד {MAX_ITEM_TAGS} תגיות</span>
            ) : (
              selectedTags.map((tag) => (
                <TagChip
                  key={tag}
                  name={tag}
                  color={colorForTag(tag, userTags)}
                  size="sm"
                />
              ))
            )}
          </div>
          <button type="button" onClick={onClose} className="tag-wheel-close mt-2 w-full">
            סגור
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
