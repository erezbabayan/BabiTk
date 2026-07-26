/** Default tag definitions seeded for new users. */
export const DEFAULT_USER_TAG_DEFINITIONS: { name: string; color: string }[] = [
  { name: "בית", color: "#3b82f6" },
  { name: "עבודה", color: "#8b5cf6" },
  { name: "לימודים", color: "#0ea5e9" },
  { name: "סטארטאפ", color: "#06b6d4" },
  { name: "קודים", color: "#ef4444" },
  { name: "רעיונות", color: "#f59e0b" },
  { name: "פיננסי", color: "#10b981" },
  { name: "משפחה", color: "#ec4899" },
];

export const DEFAULT_TAG_NAMES = DEFAULT_USER_TAG_DEFINITIONS.map((tag) => tag.name);
