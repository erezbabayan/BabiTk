import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { snoozePresets } from "../hooks/useInboxItems";
import { getItemColumn, type DashboardColumn } from "../lib/item-columns";
import type { MindtaskerItem } from "../lib/supabase";
import { colorForTag, formatTagLabel, readableTextColor, type UserTag } from "../lib/tags";
import { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";
import { isListReminderActive } from "../../../convex/lib/taskListNames";
import { isReminderActive } from "../lib/item-display";
import {
  effectiveTaskDueDate,
  getReminderFlags,
  getReminderRecurrence,
  REMINDER_RECURRENCE_OPTIONS,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";
import { DueDateFields } from "./DueDateFields";
import { BOARD_TAB_LABELS } from "../lib/board-labels";

interface ListReminderSheetProps {
  listName: string;
  reminderAt: string | null;
  visible: boolean;
  onSelect: (iso: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ListReminderSheet({
  listName,
  reminderAt,
  visible,
  onSelect,
  onClear,
  onClose,
}: ListReminderSheetProps) {
  const [dueParts, setDueParts] = useState<DueDateParts>({ date: "", hour: "09", minute: "00" });

  useEffect(() => {
    if (visible) setDueParts(splitDueDate(reminderAt));
  }, [visible, reminderAt, listName]);

  const customIso = combineDueDate(dueParts);
  const presets = snoozePresets();
  const hasReminder = isListReminderActive(reminderAt);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>תזכורת לרשימה — {listName}</Text>

            {presets.map((opt) => (
              <Pressable
                key={opt.label}
                style={styles.option}
                onPress={() => {
                  onSelect(opt.iso);
                  onClose();
                }}
              >
                <Text style={styles.optionText}>{opt.label}</Text>
              </Pressable>
            ))}

            <View style={styles.calendarSection}>
              <Text style={styles.sectionLabel}>או בחר מתאריך ביומן</Text>
              <DueDateFields value={dueParts} onChange={setDueParts} />
              <Pressable
                style={[styles.saveBtn, !customIso && styles.saveBtnDisabled]}
                disabled={!customIso}
                onPress={() => {
                  if (!customIso) return;
                  onSelect(customIso);
                  onClose();
                }}
              >
                <Text style={styles.saveBtnText}>שמור תזכורת</Text>
              </Pressable>
            </View>

            {hasReminder ? (
              <Pressable
                style={styles.clearBtn}
                onPress={() => {
                  onClear();
                  onClose();
                }}
              >
                <Text style={styles.clearBtnText}>ביטול תזכורת</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>סגור</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SnoozeSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  onSelect: (
    item: MindtaskerItem,
    iso: string,
    recurrence?: ReminderRecurrence | null,
  ) => void;
  onClear: (item: MindtaskerItem) => void;
  onClose: () => void;
}

function initialDueParts(item: MindtaskerItem): DueDateParts {
  if (getReminderFlags(item.metadata).disabled) {
    return splitDueDate(null);
  }
  return splitDueDate(effectiveTaskDueDate(item));
}

export function SnoozeSheet({ item, visible, onSelect, onClear, onClose }: SnoozeSheetProps) {
  const [dueParts, setDueParts] = useState<DueDateParts>({ date: "", hour: "09", minute: "00" });
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(null);

  useEffect(() => {
    if (item) {
      setDueParts(initialDueParts(item));
      setRecurrence(getReminderRecurrence(item.metadata));
    }
  }, [item?.id, item?.due_date, item?.metadata]);

  if (!item) return null;

  const activeItem = item;
  const customIso = combineDueDate(dueParts);
  const presets = snoozePresets();
  const hasReminder = isReminderActive(activeItem);

  function commit(iso: string) {
    onSelect(activeItem, iso, recurrence);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>תזכורת — {item.title}</Text>

            {presets.map((opt) => (
              <Pressable
                key={opt.label}
                style={styles.option}
                onPress={() => commit(opt.iso)}
              >
                <Text style={styles.optionText}>{opt.label}</Text>
              </Pressable>
            ))}

            <View style={styles.calendarSection}>
              <Text style={styles.sectionLabel}>חזרתיות</Text>
              <View style={styles.recurrenceRow}>
                <Pressable
                  style={[
                    styles.recurrenceChip,
                    recurrence === null && styles.recurrenceChipActive,
                  ]}
                  onPress={() => setRecurrence(null)}
                >
                  <Text
                    style={[
                      styles.recurrenceChipText,
                      recurrence === null && styles.recurrenceChipTextActive,
                    ]}
                  >
                    חד־פעמי
                  </Text>
                </Pressable>
                {REMINDER_RECURRENCE_OPTIONS.map((opt) => {
                  const active = recurrence === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.recurrenceChip, active && styles.recurrenceChipActive]}
                      onPress={() => setRecurrence(opt.value)}
                    >
                      <Text
                        style={[
                          styles.recurrenceChipText,
                          active && styles.recurrenceChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>או בחר מתאריך ביומן</Text>
              <DueDateFields value={dueParts} onChange={setDueParts} />
              <Pressable
                style={[styles.saveBtn, !customIso && styles.saveBtnDisabled]}
                disabled={!customIso}
                onPress={() => {
                  if (!customIso) return;
                  commit(customIso);
                }}
              >
                <Text style={styles.saveBtnText}>שמור תזכורת</Text>
              </Pressable>
            </View>

            {hasReminder ? (
              <Pressable
                style={styles.clearBtn}
                onPress={() => {
                  onClear(item);
                  onClose();
                }}
              >
                <Text style={styles.clearBtnText}>ביטול תזכורת</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>סגור</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface TagsSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  userTags: UserTag[];
  onToggleTag: (item: MindtaskerItem, tag: string) => void;
  onClose: () => void;
}

interface MoveBoardSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  onSelect: (item: MindtaskerItem, target: DashboardColumn) => void | Promise<void>;
  onClose: () => void;
}

const MOVE_BOARD_OPTIONS: Array<{
  column: DashboardColumn;
  label: string;
  tone: string;
}> = [
  { column: "inbox", label: BOARD_TAB_LABELS.inbox, tone: "#64748b" },
  { column: "today", label: BOARD_TAB_LABELS.today, tone: "#2563eb" },
  { column: "notes", label: BOARD_TAB_LABELS.notes, tone: "#ea580c" },
];

export function MoveBoardSheet({ item, visible, onSelect, onClose }: MoveBoardSheetProps) {
  if (!item) return null;

  const current = getItemColumn(item);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>העברה לבורד</Text>
          <Text style={styles.moveSubtitle} numberOfLines={2}>
            {item.title}
          </Text>
          {MOVE_BOARD_OPTIONS.map((option) => {
            const isCurrent = option.column === current;
            return (
              <Pressable
                key={option.column}
                style={[styles.option, isCurrent && styles.optionCurrent]}
                disabled={isCurrent}
                onPress={() => {
                  void onSelect(item, option.column);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: option.tone },
                    isCurrent && styles.optionCurrentText,
                  ]}
                >
                  {isCurrent ? `${option.label} (נוכחי)` : option.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>סגור</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function TagsSheet({
  item,
  visible,
  userTags,
  onToggleTag,
  onClose,
}: TagsSheetProps) {
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>תגיות — {item.title}</Text>
          <View style={styles.tagRow}>
            {userTags.map((tagDef) => {
              const active = item.tags.includes(tagDef.name);
              const textColor = active
                ? readableTextColor(tagDef.color)
                : colorForTag(tagDef.name, userTags);
              return (
                <Pressable
                  key={tagDef.id}
                  style={[
                    styles.tag,
                    active
                      ? { backgroundColor: tagDef.color, borderColor: tagDef.color }
                      : {
                          backgroundColor: `${tagDef.color}22`,
                          borderColor: `${tagDef.color}66`,
                        },
                  ]}
                  onPress={() => onToggleTag(item, tagDef.name)}
                >
                  <Text style={[styles.tagText, { color: textColor }]}>{formatTagLabel(tagDef.name)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>סגור</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: "#0f172a", textAlign: "right" },
  moveSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "right",
    marginBottom: 8,
    marginTop: -4,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  optionCurrent: {
    opacity: 0.45,
  },
  optionText: { fontSize: 15, color: "#334155", textAlign: "right" },
  optionCurrentText: {
    fontWeight: "600",
  },
  calendarSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "right",
    marginBottom: 4,
  },
  recurrenceRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  recurrenceChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  recurrenceChipActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  recurrenceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  recurrenceChipTextActive: { color: "#1d4ed8" },
  saveBtn: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  clearBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  clearBtnText: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
  tagRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tag: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: { fontSize: 13, fontWeight: "600" },
  cancel: { marginTop: 16, alignItems: "center" },
  cancelText: { color: "#64748b", fontSize: 15 },
});
