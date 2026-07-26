import { Pressable, StyleSheet, View } from "react-native";
import type { MindtaskerItem } from "../lib/supabase";
import { isReminderActive } from "../lib/item-display";
import { NotebookIcon, type NotebookIconName, type NotebookIconTone } from "./NotebookIcons";

export type BoardTab = "inbox" | "today" | "notes";
export type ListView = "active" | "archive" | "completed";

interface ItemActionBarProps {
  item: MindtaskerItem;
  tab: BoardTab;
  listView: ListView;
  onEdit: () => void;
  onToggleType: () => void;
  onComplete: () => void;
  onSnooze: () => void;
  showCompleteAction?: boolean;
  showUndoAction?: boolean;
  onUndo?: () => void;
  onTagPress?: () => void;
  tagPickerOpen?: boolean;
  dense?: boolean;
}

function GhostButton({
  icon,
  label,
  onPress,
  active = false,
  accent = false,
  reminder = false,
  dense = false,
  tone = "slate",
}: {
  icon: NotebookIconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  accent?: boolean;
  reminder?: boolean;
  dense?: boolean;
  tone?: NotebookIconTone;
}) {
  let iconTone: NotebookIconTone = tone;
  if (accent) iconTone = "success";
  else if (reminder) iconTone = "danger";
  else if (active) iconTone = "slate";

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: active || reminder }}
      hitSlop={4}
      style={[
        styles.ghostBtn,
        dense && styles.ghostBtnDense,
        active && styles.ghostBtnActive,
        accent && styles.ghostBtnAccent,
        reminder && styles.ghostBtnReminder,
      ]}
    >
      <NotebookIcon name={icon} size={dense ? 12 : 14} tone={iconTone} />
    </Pressable>
  );
}

/**
 * Always show the full action set on every item (tag, edit, type, reminder, done/undo).
 * Handlers decide what each button does; we no longer hide buttons by board/tab.
 */
export function ItemActionBar({
  item,
  onEdit,
  onToggleType,
  onComplete,
  onSnooze,
  showCompleteAction = false,
  showUndoAction = false,
  onUndo = () => {},
  onTagPress,
  tagPickerOpen = false,
  dense = false,
}: ItemActionBarProps) {
  const isNote = !item.is_actionable;
  const reminderOn = isReminderActive(item);

  return (
    <View style={[styles.row, dense && styles.rowDense]} collapsable={false}>
      {onTagPress ? (
        <GhostButton
          icon="tag"
          label="תיוג"
          onPress={onTagPress}
          active={tagPickerOpen}
          dense={dense}
          tone={tagPickerOpen ? "orange" : "slate"}
        />
      ) : null}
      <GhostButton icon="edit" label="עריכה" onPress={onEdit} dense={dense} />
      <GhostButton
        icon="swap"
        label={isNote ? "הפוך למשימה" : "הפוך להערה"}
        onPress={onToggleType}
        dense={dense}
      />
      <GhostButton
        icon="bell"
        label="תזכורת"
        onPress={onSnooze}
        reminder={reminderOn}
        dense={dense}
      />
      {showUndoAction ? (
        <GhostButton icon="undo" label="שחזר" onPress={onUndo} active dense={dense} />
      ) : showCompleteAction ? (
        <GhostButton icon="circle" label="בוצע" onPress={onComplete} accent dense={dense} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 4,
    flexShrink: 1,
    width: "100%",
    maxWidth: "100%",
    justifyContent: "flex-end",
  },
  rowDense: {
    gap: 2,
  },
  ghostBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnDense: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  ghostBtnActive: {
    borderColor: "#94a3b8",
    backgroundColor: "#f1f5f9",
  },
  ghostBtnAccent: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  ghostBtnReminder: {
    borderColor: "#ef4444",
    borderWidth: 1.5,
    backgroundColor: "#fef2f2",
  },
});
