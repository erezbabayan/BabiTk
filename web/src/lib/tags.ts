export interface UserTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export const DEFAULT_USER_TAGS: { name: string; color: string }[] = [
  { name: "בית", color: "#3b82f6" },
  { name: "עבודה", color: "#8b5cf6" },
  { name: "קודים", color: "#ef4444" },
  { name: "רעיונות", color: "#f59e0b" },
  { name: "פיננסי", color: "#10b981" },
  { name: "משפחה", color: "#ec4899" },
];

export function tagColorMap(tags: UserTag[]): Map<string, string> {
  return new Map(tags.map((tag) => [tag.name, tag.color]));
}

export function colorForTag(name: string, tags: UserTag[], fallback = "#64748b"): string {
  return tags.find((tag) => tag.name === name)?.color ?? fallback;
}

export function readableTextColor(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#ffffff";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1e293b" : "#ffffff";
}
