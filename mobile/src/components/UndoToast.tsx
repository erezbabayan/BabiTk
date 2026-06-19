import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MindtaskerItem } from "../lib/supabase";

interface UndoToastProps {
  item: MindtaskerItem | null;
  onUndo: () => void;
}

export function UndoToast({ item, onUndo }: UndoToastProps) {
  if (!item) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={1}>
        נמחק: {item.title}
      </Text>
      <Pressable onPress={onUndo} style={styles.undoBtn}>
        <Text style={styles.undoText}>בטל</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  text: { flex: 1, color: "#f8fafc", fontSize: 14, marginLeft: 12 },
  undoBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  undoText: { color: "#38bdf8", fontWeight: "700", fontSize: 14 },
});
