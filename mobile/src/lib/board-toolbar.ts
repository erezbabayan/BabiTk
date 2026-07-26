import type { TextStyle, ViewStyle } from "react-native";

export type BoardToolbarTone = "slate" | "blue" | "orange";

export const boardToolbarBtn: ViewStyle = {
  borderWidth: 1,
  borderColor: "rgba(203, 213, 225, 0.9)",
  borderRadius: 6,
  paddingHorizontal: 6,
  paddingVertical: 4,
  backgroundColor: "rgba(255,255,255,0.95)",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
};

const TOOLBAR_TEXT: Record<BoardToolbarTone, TextStyle> = {
  slate: { color: "#334155" },
  blue: { color: "#1d4ed8" },
  orange: { color: "#c2410c" },
};

export function boardToolbarText(tone: BoardToolbarTone): TextStyle {
  return { fontWeight: "600", fontSize: 9, lineHeight: 11, ...TOOLBAR_TEXT[tone] };
}
