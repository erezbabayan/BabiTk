import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MindtaskerItem } from "../lib/supabase";
import { resolveItemSource } from "../lib/item-source";
import { NotebookIcon, type NotebookIconTone } from "./NotebookIcons";

interface SourceIndicatorProps {
  item: MindtaskerItem;
  onPress: () => void;
  iconOnly?: boolean;
}

export function SourceIndicator({ item, onPress, iconOnly = false }: SourceIndicatorProps) {
  const source = resolveItemSource(item);
  const iconTone: NotebookIconTone = source.canOpen ? "slate" : "muted";

  if (iconOnly) {
    if (!source.canOpen) {
      return (
        <View style={[styles.ghostCircle, styles.ghostStatic]}>
          <NotebookIcon name={source.icon} size={12} tone="muted" />
        </View>
      );
    }
    return (
      <Pressable onPress={onPress} hitSlop={6} style={styles.ghostCircle}>
        <NotebookIcon name={source.icon} size={12} tone={iconTone} />
      </Pressable>
    );
  }

  if (!source.canOpen) {
    return (
      <View style={styles.staticRow}>
        <NotebookIcon name={source.icon} size={11} tone="muted" />
        <Text style={styles.static}>{source.label}</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <NotebookIcon name={source.icon} size={11} tone="slate" />
      <Text style={styles.chipText}>{source.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ghostCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostStatic: { borderColor: "#e2e8f0" },
  chip: {
    alignSelf: "flex-end",
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  chipText: { fontSize: 9, color: "#475569", fontWeight: "600" },
  staticRow: {
    marginTop: 3,
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  static: { fontSize: 9, color: "#94a3b8" },
});
