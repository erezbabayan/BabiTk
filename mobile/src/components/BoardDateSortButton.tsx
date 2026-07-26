import { Text, TouchableOpacity, View } from "react-native";
import { boardToolbarBtn, boardToolbarText } from "../lib/board-toolbar";
import {
  nextDateSortDirection,
  type BoardDateSortDirection,
} from "../lib/board-date-sort";
import type { BoardToolbarTone } from "../lib/board-toolbar";
import { NotebookIcon, type NotebookIconTone } from "./NotebookIcons";

interface BoardDateSortButtonProps {
  direction: BoardDateSortDirection;
  onDirectionChange: (direction: BoardDateSortDirection) => void;
  tone?: BoardToolbarTone;
}

const activeBg: Record<BoardToolbarTone, string> = {
  slate: "#f1f5f9",
  blue: "#dbeafe",
  orange: "#ffedd5",
};

function iconTone(tone: BoardToolbarTone): NotebookIconTone {
  if (tone === "blue") return "blue";
  if (tone === "orange") return "orange";
  return "slate";
}

export function BoardDateSortButton({
  direction,
  onDirectionChange,
  tone = "slate",
}: BoardDateSortButtonProps) {
  const label =
    direction === "asc"
      ? "מיון לפי תאריך: ישן → חדש"
      : direction === "desc"
        ? "מיון לפי תאריך: חדש → ישן"
        : "מיון לפי תאריך";

  return (
    <TouchableOpacity
      style={[
        boardToolbarBtn,
        direction ? { backgroundColor: activeBg[tone] } : null,
        { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
      ]}
      onPress={() => onDirectionChange(nextDateSortDirection(direction))}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: direction !== null }}
    >
      <NotebookIcon name="sort" size={12} tone={iconTone(tone)} />
      <Text style={boardToolbarText(tone)}>לפי תאריך</Text>
    </TouchableOpacity>
  );
}
