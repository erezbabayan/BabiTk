export type SwipeActionIconName = "trash" | "archive" | "check" | "undo";

export type SwipeActionTone = "danger" | "tasks" | "notes";

export interface SwipeActionStyle {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  textColor: string;
}

export const SWIPE_ACTION_STYLE: Record<SwipeActionTone, SwipeActionStyle> = {
  danger: {
    backgroundColor: "#fdf6f5",
    borderColor: "#e8d4d2",
    iconColor: "#c98888",
    textColor: "#9f6b6b",
  },
  tasks: {
    backgroundColor: "#f4f7fb",
    borderColor: "#d4e1ef",
    iconColor: "#7a9ec8",
    textColor: "#5a7a9e",
  },
  notes: {
    backgroundColor: "#fdf8f3",
    borderColor: "#ecd9c8",
    iconColor: "#d4a574",
    textColor: "#a67c52",
  },
};

export function swipeActionStyle(tone: SwipeActionTone): SwipeActionStyle {
  return SWIPE_ACTION_STYLE[tone];
}
