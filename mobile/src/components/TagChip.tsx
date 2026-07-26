import { formatTagLabel } from "../lib/tags";
import { TagBrushFrame } from "./MindTaskerLogo";
interface TagChipProps {
  name: string;
  color: string;
  size?: "xs" | "sm";
  variant?: "item" | "toolbar";
  selected?: boolean;
  onPress?: () => void;
}

export function TagChip({ name, color, size = "xs", variant = "toolbar", selected = true, onPress }: TagChipProps) {
  const label = formatTagLabel(name);

  return (
    <TagBrushFrame
      color={color}
      size={size}
      variant={variant}
      selected={selected}
      onPress={onPress}
    >
      {label}
    </TagBrushFrame>
  );
}
