import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BoardDateFilter } from "../lib/filter-items";

interface DateScopeFilterBarProps {
  value: BoardDateFilter;
  onChange: (value: BoardDateFilter) => void;
}

const CHIPS: Array<{
  id: Exclude<BoardDateFilter, "all">;
  label: string;
  accessibilityLabel: string;
}> = [
  { id: "today", label: "היום", accessibilityLabel: "סינון להיום" },
  { id: "tomorrow", label: "מחר", accessibilityLabel: "סינון למחר" },
  { id: "overdue", label: "עבר", accessibilityLabel: "סינון לתאריך שעבר" },
  { id: "undated", label: "ללא תאריך", accessibilityLabel: "סינון בלי תאריך" },
];

export function DateScopeFilterBar({ value, onChange }: DateScopeFilterBarProps) {
  return (
    <View style={styles.row}>
      {CHIPS.map((chip) => {
        const active = value === chip.id;
        return (
          <Pressable
            key={chip.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(active ? "all" : chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={chip.accessibilityLabel}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  chip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  chipActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  chipTextActive: {
    color: "#1d4ed8",
  },
});
