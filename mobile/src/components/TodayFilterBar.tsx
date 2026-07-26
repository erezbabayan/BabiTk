import { Pressable, StyleSheet, Text } from "react-native";

interface TodayFilterBarProps {
  active: boolean;
  onToggle: (active: boolean) => void;
}

export function TodayFilterBar({ active, onToggle }: TodayFilterBarProps) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => onToggle(!active)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel="סינון משימות להיום"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>היום</Text>
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
