import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  bulkActionCounts,
  sendToBoardBulkLabel,
  type BoardBulkAction,
  type BoardBulkItem,
} from "../lib/board-bulk-actions";

interface BoardBulkBarProps {
  items: BoardBulkItem[];
  total: number;
  busy?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onAction: (action: BoardBulkAction) => void;
}

function Chip({
  label,
  onPress,
  disabled,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        tone === "danger" && styles.chipDanger,
        tone === "success" && styles.chipSuccess,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          tone === "danger" && styles.chipTextDanger,
          tone === "success" && styles.chipTextSuccess,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BoardBulkBar({
  items,
  total,
  busy = false,
  onSelectAll,
  onClear,
  onExit,
  onAction,
}: BoardBulkBarProps) {
  const counts = bulkActionCounts(items);
  const allSelected = total > 0 && items.length === total;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Text style={styles.count}>{items.length > 0 ? `${items.length} נבחרו` : "בחירה"}</Text>
        <Chip
          label={allSelected ? "בטל בחירה" : "בחר הכל"}
          disabled={busy || total === 0}
          onPress={allSelected ? onClear : onSelectAll}
        />
        {counts.complete > 0 ? (
          <Chip
            label={`בוצע (${counts.complete})`}
            tone="success"
            disabled={busy}
            onPress={() => onAction("complete")}
          />
        ) : null}
        {counts.archive > 0 ? (
          <Chip
            label={`ארכיון (${counts.archive})`}
            disabled={busy}
            onPress={() => onAction("archive")}
          />
        ) : null}
        {counts.restore > 0 ? (
          <Chip
            label={`שחזר (${counts.restore})`}
            tone="success"
            disabled={busy}
            onPress={() => onAction("restore")}
          />
        ) : null}
        {counts.convertToNote > 0 ? (
          <Chip
            label={`הפוך להערה (${counts.convertToNote})`}
            disabled={busy}
            onPress={() => onAction("convertToNote")}
          />
        ) : null}
        {counts.convertToTask > 0 ? (
          <Chip
            label={`הפוך למשימה (${counts.convertToTask})`}
            disabled={busy}
            onPress={() => onAction("convertToTask")}
          />
        ) : null}
        {counts.sendToBoard > 0 ? (
          <Chip
            label={`${sendToBoardBulkLabel(items)} (${counts.sendToBoard})`}
            disabled={busy}
            onPress={() => onAction("sendToBoard")}
          />
        ) : null}
        {counts.delete > 0 ? (
          <Chip
            label={`מחק (${counts.delete})`}
            tone="danger"
            disabled={busy}
            onPress={() => onAction("delete")}
          />
        ) : null}
        <Chip label="סיום" disabled={busy} onPress={onExit} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  count: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  chip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  chipSuccess: {
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  chipTextDanger: {
    color: "#b91c1c",
  },
  chipTextSuccess: {
    color: "#047857",
  },
});
