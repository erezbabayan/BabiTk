import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BoardItemView } from "../lib/board-item-view";

interface BoardViewToggleProps {
  view: BoardItemView;
  onToggle: () => void;
}

/** Sliding switch that toggles board items between list and squares. */
export function BoardViewToggle({ view, onToggle }: BoardViewToggleProps) {
  const isSquares = view === "squares";

  return (
    <Pressable
      onPress={onToggle}
      style={styles.root}
      accessibilityRole="button"
      accessibilityLabel="שינוי תצוגה"
      accessibilityState={{ selected: isSquares }}
    >
      <Text style={styles.label}>שינוי תצוגה</Text>
      <View style={[styles.track, isSquares && styles.trackSquares]}>
        <View style={[styles.thumb, isSquares && styles.thumbSquares]} />
        <Text style={[styles.icon, styles.iconList, isSquares && styles.iconDim]}>☰</Text>
        <Text style={[styles.icon, styles.iconGrid, !isSquares && styles.iconDim]}>▦</Text>
      </View>
    </Pressable>
  );
}

const TRACK_W = 44;
const TRACK_H = 24;
const THUMB = 18;

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    overflow: "hidden",
  },
  trackSquares: {
    backgroundColor: "#cbd5e1",
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#ffffff",
    left: 3,
    top: (TRACK_H - THUMB) / 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    zIndex: 2,
  },
  thumbSquares: {
    left: TRACK_W - THUMB - 3,
  },
  icon: {
    position: "absolute",
    top: 3,
    fontSize: 11,
    lineHeight: 18,
    color: "#475569",
    zIndex: 1,
  },
  iconList: {
    left: 7,
  },
  iconGrid: {
    right: 7,
  },
  iconDim: {
    opacity: 0.35,
  },
});
