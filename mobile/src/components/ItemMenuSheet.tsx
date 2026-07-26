import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { archiveRestoreLabel, inboxTransferLabel } from "../lib/item-actions";
import type { MindtaskerItem } from "../lib/supabase";

type BoardTab = "inbox" | "today" | "notes";
type ListView = "active" | "archive" | "completed";

function itemHasSource(item: MindtaskerItem): boolean {
  if (item.source_materials?.source_type) return true;
  return Boolean(item.content?.trim() || item.title?.trim());
}

interface ItemMenuSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  tab: BoardTab;
  listView: ListView;
  onClose: () => void;
  onEdit: (item: MindtaskerItem) => void;
  onToggleType: (item: MindtaskerItem) => void;
  onApprove: (item: MindtaskerItem) => void;
  onComplete: (item: MindtaskerItem) => void;
  onSnooze: (item: MindtaskerItem) => void;
  onArchive: (item: MindtaskerItem) => void;
  onRestore: (item: MindtaskerItem) => void;
  onDelete: (item: MindtaskerItem) => void;
  onViewSource?: (item: MindtaskerItem) => void;
}

function MenuOption({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable style={[styles.option, danger && styles.danger]} onPress={onPress}>
      <Text
        style={[
          styles.optionText,
          primary && styles.primaryText,
          danger && styles.dangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ItemMenuSheet({
  item,
  visible,
  tab,
  listView,
  onClose,
  onEdit,
  onToggleType,
  onApprove,
  onComplete,
  onSnooze,
  onArchive,
  onRestore,
  onDelete,
  onViewSource,
}: ItemMenuSheetProps) {
  if (!item) return null;

  const current = item;
  const isNote = !current.is_actionable;
  const canViewSource = Boolean(onViewSource && itemHasSource(current));

  function closeAnd(run: (entry: MindtaskerItem) => void) {
    run(current);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{current.title}</Text>

          <MenuOption label="✏️ ערוך" onPress={() => closeAnd(onEdit)} />

          {listView === "active" ? (
            <MenuOption
              label={isNote ? "↔ הפוך למשימה" : "↔ הפוך להערה"}
              onPress={() => closeAnd(onToggleType)}
            />
          ) : null}

          {canViewSource ? (
            <MenuOption
              label="📎 צפה במקור"
              onPress={() => {
                onViewSource?.(current);
                onClose();
              }}
            />
          ) : null}

          {listView === "archive" ? (
            <MenuOption
              label={archiveRestoreLabel(current)}
              primary
              onPress={() => closeAnd(onRestore)}
            />
          ) : null}

          {listView === "completed" ? (
            <>
              <MenuOption
                label="שחזר למשימות"
                primary
                onPress={() => closeAnd(onRestore)}
              />
              <MenuOption label="🗑 מחק" danger onPress={() => closeAnd(onDelete)} />
            </>
          ) : null}

          {tab === "inbox" && listView === "active" ? (
            <MenuOption
              label={inboxTransferLabel(current)}
              primary
              onPress={() => closeAnd(onApprove)}
            />
          ) : null}

          {tab === "today" && listView === "active" ? (
            <>
              <MenuOption label="בוצע ✓" primary onPress={() => closeAnd(onComplete)} />
              <MenuOption label="תזכורת" onPress={() => closeAnd(onSnooze)} />
              <MenuOption label="📦 ארכיון" onPress={() => closeAnd(onArchive)} />
            </>
          ) : null}

          {tab === "notes" && listView === "active" ? (
            <>
              <MenuOption label="📦 ארכיון" onPress={() => closeAnd(onArchive)} />
              <MenuOption label="🗑 מחק" danger onPress={() => closeAnd(onDelete)} />
            </>
          ) : null}

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>סגור</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12, textAlign: "right", color: "#0f172a" },
  option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  optionText: { fontSize: 15, color: "#334155", textAlign: "right" },
  primaryText: { color: "#2563eb", fontWeight: "700" },
  danger: { borderBottomWidth: 0 },
  dangerText: { color: "#dc2626" },
  cancel: { marginTop: 16, alignItems: "center" },
  cancelText: { color: "#64748b", fontSize: 15 },
});
