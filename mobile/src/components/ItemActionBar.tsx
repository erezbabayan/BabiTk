import { StyleSheet, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import type { MindtaskerItem } from "../lib/supabase";

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
}

function IconButton({
  icon,
  label,
  onPress,
  variant = "default",
}: {
  icon: string;
  label: string;
  onPress: () => void;
  variant?: "default" | "success";
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.btn, variant === "success" && styles.btnSuccess]}
    >
      <Text style={[styles.btnText, variant === "success" && styles.btnTextOnColor]}>{icon}</Text>
    </TouchableOpacity>
  );
}

export function ItemActionBar({
  item,
  tab,
  listView,
  onEdit,
  onToggleType,
  onComplete,
  onSnooze,
}: ItemActionBarProps) {
  const isNote = !item.is_actionable;

  if (listView === "archive" || listView === "completed") {
    return (
      <View style={styles.row}>
        <IconButton icon="✏️" label="ערוך" onPress={onEdit} />
      </View>
    );
  }

  if (tab === "inbox") {
    return (
      <View style={styles.row}>
        <IconButton icon="✏️" label="ערוך" onPress={onEdit} />
        <IconButton
          icon="🔁"
          label={isNote ? "הפוך למשימה" : "הפוך להערה"}
          onPress={onToggleType}
        />
      </View>
    );
  }

  if (tab === "today") {
    return (
      <View style={styles.row}>
        <IconButton icon="✏️" label="ערוך" onPress={onEdit} />
        <IconButton
          icon="🔁"
          label={isNote ? "הפוך למשימה" : "הפוך להערה"}
          onPress={onToggleType}
        />
        <IconButton icon="⏰" label="נודניק" onPress={onSnooze} />
        <IconButton icon="✅" label="בוצע" onPress={onComplete} variant="success" />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <IconButton icon="✏️" label="ערוך" onPress={onEdit} />
      <IconButton
        icon="🔁"
        label={isNote ? "הפוך למשימה" : "הפוך להערה"}
        onPress={onToggleType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  btn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "#fff",
    minWidth: 24,
    alignItems: "center",
  },
  btnSuccess: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  btnText: { fontSize: 12, lineHeight: 14 },
  btnTextOnColor: { color: "#fff" },
});
