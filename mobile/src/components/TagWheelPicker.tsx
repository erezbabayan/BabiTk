import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { TagChip } from "./TagChip";
import { NotebookIcon } from "./NotebookIcons";
import {
  buildWheelSlots,
  CENTER_SIZE,
  CHIP_SIZE,
  DIAL_SIZE,
  slotPosition,
} from "../lib/tag-wheel-layout";

const TAG_LABEL_COLOR = "#57534e";

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityLabel={itemTitle ? `תיוג פריט — ${itemTitle}` : "תיוג פריט"}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.heading}>תיוג</Text>

          <View style={styles.body}>
            <View style={styles.dialWrap}>
            <View style={styles.dialFrame}>
              <View style={styles.dialRing} />
              <View style={styles.dialInnerRing} />

              {wheelSlots.map((slot, index) => {
                const pos = slotPosition(index);
                if (slot.kind === "empty") {
                  const hintFill = tagWheelChipFill(slot.hintColor);
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={canAddMoreTags ? openCreate : undefined}
                      disabled={!canAddMoreTags}
                      style={[
                        styles.emptySlot,
                        {
                          left: pos.left,
                          top: pos.top,
                          borderColor: `${hintFill}dd`,
                          backgroundColor: hintFill,
                        },
                        !canAddMoreTags && styles.chipDisabled,
                      ]}
                      accessibilityLabel="תגית חדשה"
                    >
                      <NotebookIcon name="plus" size={14} tone="muted" />
                    </Pressable>
                  );
                }

                const selected = selectedTags.includes(slot.name);
                const chipFill = tagWheelChipFill(slot.color);
                const chipText = tagWheelChipText(slot.color);
                return (
                  <Pressable
                    key={slot.id}
                    onPress={() => handleTagPress(slot.name)}
                    style={[
                      styles.chip,
                      {
                        left: pos.left,
                        top: pos.top,
                        backgroundColor: chipFill,
                        borderColor: selected ? "#78716c" : "rgba(214, 211, 209, 0.9)",
                      },
                      selected && styles.chipSelected,
                      !selected && atLimit && styles.chipDisabled,
                    ]}
                  >
                    <Text
                      style={[styles.chipText, { color: chipText }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      ellipsizeMode="tail"
                    >
                      {formatTagLabel(slot.name)}
                    </Text>
                  </Pressable>
                );
              })}

              <View style={styles.wheelCenter}>
                <NotebookIcon name="tag" size={14} tone="orange" />
              </View>
            </View>
          </View>

          {creating ? (
          <View style={styles.createBox}>
                <TextInput
                  style={styles.createInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="שם תגית חדשה"
                  placeholderTextColor="#94a3b8"
                  textAlign="right"
                  autoFocus
                />
                <View style={styles.palette}>
                  {TAG_PALETTE.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setNewColor(color)}
                      style={[
                        styles.paletteDot,
                        { backgroundColor: color },
                        newColor === color && styles.paletteDotActive,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.createActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setCreating(false)}>
                    <Text style={styles.cancelText}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmBtn, saving && styles.disabled]}
                    onPress={() => void handleCreate()}
                    disabled={saving}
                  >
                    <Text style={styles.confirmText}>{saving ? "..." : "צור"}</Text>
                  </Pressable>
                </View>
              </View>
          ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footerFrame}>
            <View style={styles.selectedRow}>
              {selectedTags.length === 0 ? (
                <Text style={styles.emptyHint}>בחר עד {MAX_ITEM_TAGS} תגיות</Text>
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
            </View>

            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneText}>סגור</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 300,
    height: 480,
    backgroundColor: "#fffefb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(214, 211, 209, 0.75)",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: "center",
    flexDirection: "column",
    overflow: "hidden",
  },
  heading: { fontSize: 18, fontWeight: "600", color: "#57534e", marginBottom: 8 },
  body: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },
  dialWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dialFrame: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  dialRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DIAL_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(214, 211, 209, 0.85)",
    backgroundColor: "#fdfaf3",
  },
  dialInnerRing: {
    position: "absolute",
    left: 14,
    top: 14,
    width: DIAL_SIZE - 28,
    height: DIAL_SIZE - 28,
    borderRadius: (DIAL_SIZE - 28) / 2,
    borderWidth: 1,
    borderColor: "rgba(231, 229, 228, 0.9)",
    backgroundColor: "rgba(255, 254, 251, 0.8)",
  },
  wheelCenter: {
    position: "absolute",
    left: DIAL_SIZE / 2 - CENTER_SIZE / 2,
    top: DIAL_SIZE / 2 - CENTER_SIZE / 2,
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(214, 211, 209, 0.9)",
    zIndex: 2,
  },
  centerIcon: { fontSize: 14 },
  chip: {
    position: "absolute",
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 3,
  },
  emptySlot: {
    position: "absolute",
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    zIndex: 3,
  },
  plusIcon: { fontSize: 14, fontWeight: "500", lineHeight: 16, color: "#78716c" },
  chipSelected: {
    borderWidth: 2,
  },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    width: "100%",
    fontSize: 7,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 9,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  createBox: { width: "100%", gap: 8, marginTop: 8 },
  createInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#f8fafc",
  },
  palette: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  paletteDot: { width: 24, height: 24, borderRadius: 12 },
  paletteDotActive: { borderWidth: 2, borderColor: "#0f172a" },
  createActions: { flexDirection: "row-reverse", gap: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelText: { color: "#64748b", fontWeight: "600" },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 12, marginTop: 2 },
  footerFrame: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "rgba(231, 229, 228, 0.9)",
    backgroundColor: "rgba(253, 250, 243, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  selectedRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 4,
    minHeight: 32,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyHint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
  },
  doneBtn: {
    marginTop: 8,
    width: "100%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 8,
    alignItems: "center",
  },
  doneText: { color: "#57534e", fontWeight: "700", fontSize: 14 },
  disabled: { opacity: 0.5 },
});
