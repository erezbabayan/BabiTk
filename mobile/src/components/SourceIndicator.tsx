import { Pressable, StyleSheet, Text } from "react-native";
import type { MindtaskerItem } from "../lib/supabase";
import { resolveItemSource } from "../lib/item-source";

interface SourceIndicatorProps {
  item: MindtaskerItem;
  onPress: () => void;
  iconOnly?: boolean;
}

export function SourceIndicator({ item, onPress, iconOnly = false }: SourceIndicatorProps) {
  const source = resolveItemSource(item);

  if (iconOnly) {
    if (!source.canOpen) {
      return <Text style={styles.iconOnlyStatic}>{source.icon}</Text>;
    }
    return (
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={styles.iconOnly}>{source.icon}</Text>
      </Pressable>
    );
  }

  if (!source.canOpen) {
    return (
      <Text style={styles.static}>
        {source.icon} {source.label}
      </Text>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>
        {source.icon} {source.label} 👁
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-end",
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  chipText: { fontSize: 9, color: "#475569", fontWeight: "600" },
  static: { marginTop: 3, fontSize: 9, color: "#94a3b8", alignSelf: "flex-end" },
  iconOnly: { fontSize: 11 },
  iconOnlyStatic: { fontSize: 11, color: "#cbd5e1" },
});
