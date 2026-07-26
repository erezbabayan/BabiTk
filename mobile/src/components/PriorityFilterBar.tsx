import { Pressable, StyleSheet, Text, View } from "react-native";
import { PriorityStar } from "./PriorityStar";

interface PriorityFilterBarProps {
  active: boolean;
  onToggle: (active: boolean) => void;
}

export function PriorityFilterBar({ active, onToggle }: PriorityFilterBarProps) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => onToggle(!active)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel="סינון עדיפות"
    >
      <View style={styles.row}>
        <PriorityStar active={active} size={14} />
        <Text style={[styles.chipText, active && styles.chipTextActive]}>עדיפות</Text>
      </View>
    </Pressable>
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
  chipActive: {
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  chipTextActive: {
    color: "#b45309",
  },
});
