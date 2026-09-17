import { Pressable, StyleSheet, Text } from "react-native";
import type { BoardDateFilter } from "../lib/filter-items";

interface BoardDateFilterBarProps {
  value: BoardDateFilter;
  onChange: (next: BoardDateFilter) => void;
}

function Chip({
  label,
  active,
  tone,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  active: boolean;
  tone: "blue" | "rose" | "slate";
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.chip,
        active && tone === "blue" && styles.chipToday,
        active && tone === "rose" && styles.chipOverdue,
        active && tone === "slate" && styles.chipUndated,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.chipText,
          active && tone === "blue" && styles.textToday,
          active && tone === "rose" && styles.textOverdue,
          active && tone === "slate" && styles.textUndated,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BoardDateFilterBar({ value, onChange }: BoardDateFilterBarProps) {
  function toggle(mode: Exclude<BoardDateFilter, "all">) {
    onChange(value === mode ? "all" : mode);
  }

  return (
    <>
      <Chip
        label="היום"
        active={value === "today"}
        tone="blue"
        accessibilityLabel="סינון פריטים להיום"
        onPress={() => toggle("today")}
      />
      <Chip
        label="עבר"
        active={value === "overdue"}
        tone="rose"
        accessibilityLabel="סינון פריטים שהתאריך שלהם עבר"
        onPress={() => toggle("overdue")}
      />
      <Chip
        label="ללא תאריך"
        active={value === "undated"}
        tone="slate"
        accessibilityLabel="סינון פריטים בלי תאריך"
        onPress={() => toggle("undated")}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  chipToday: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  chipOverdue: {
    borderColor: "#fda4af",
    backgroundColor: "#fff1f2",
  },
  chipUndated: {
    borderColor: "#94a3b8",
    backgroundColor: "#f1f5f9",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  textToday: { color: "#1d4ed8" },
  textOverdue: { color: "#be123c" },
  textUndated: { color: "#334155" },
});
