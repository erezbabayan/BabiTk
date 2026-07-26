import { formatTagLabel } from "../lib/tags";
import { TagBrushFrame } from "./MindTaskerLogo";
type TagChipSize = "xs" | "sm";
type TagChipVariant = "item" | "toolbar";

interface TagChipProps {
  name: string;
  color: string;
  size?: TagChipSize;
  variant?: TagChipVariant;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TagChip({
  name,
  color,
  size = "xs",
  variant = "toolbar",
  selected = true,
  className = "",
  onClick,
}: TagChipProps) {
  const label = formatTagLabel(name);

  return (
    <TagBrushFrame
      color={color}
      size={size}
      variant={variant}
      selected={selected}
      className={className}
      onClick={onClick}
    >
      {label}
    </TagBrushFrame>
  );
}
