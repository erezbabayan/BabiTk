export const MAX_ITEM_TAGS = 5;
export const WHEEL_SLOT_COUNT = 12;
export const MAX_USER_TAGS = 12;
export const UNIFIED_TAGS_MIGRATION_KEY = "mindtasker:unified-tags-v5-backfill-defaults";

export const TAG_PALETTE = [
  "#93c5fd",
  "#c4b5fd",
  "#fca5a5",
  "#fcd34d",
  "#86efac",
  "#f9a8d4",
  "#67e8f9",
  "#cbd5e1",
] as const;

export interface UserTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

/** Tag label for UI — never includes a leading #. */
export function formatTagLabel(name: string): string {
  return name.trim().replace(/^#+/, "");
}

/** Canonical tag name for storage and matching. */
export function normalizeTagName(name: string): string {
  return formatTagLabel(name);
}

export const DEFAULT_USER_TAGS: { name: string; color: string }[] = [
  { name: "בית", color: "#93c5fd" },
  { name: "עבודה", color: "#c4b5fd" },
  { name: "לימודים", color: "#7dd3fc" },
  { name: "סטארטאפ", color: "#67e8f9" },
  { name: "קודים", color: "#fca5a5" },
  { name: "רעיונות", color: "#fcd34d" },
  { name: "פיננסי", color: "#86efac" },
  { name: "משפחה", color: "#f9a8d4" },
];

export function defaultUserTagsPayload(): { name: string; color: string }[] {
  return DEFAULT_USER_TAGS.map((tag) => ({ name: tag.name, color: tag.color }));
}

/** Append any missing system defaults without removing custom tags. */
export function mergeMissingDefaultTags(
  existing: { name: string; color: string }[],
): { name: string; color: string }[] {
  const names = new Set(existing.map((tag) => normalizeTagName(tag.name)));
  const merged = existing.map((tag) => ({
    name: normalizeTagName(tag.name),
    color: tag.color,
  }));
  for (const tag of DEFAULT_USER_TAGS) {
    const name = normalizeTagName(tag.name);
    if (names.has(name)) continue;
    if (merged.length >= MAX_USER_TAGS) break;
    merged.push({ name, color: tag.color });
    names.add(name);
  }
  return merged;
}

export type TagDraftRow = { name: string; color: string };

export function padTagDraft(rows: TagDraftRow[]): TagDraftRow[] {
  const padded = [...rows];
  while (padded.length < MAX_USER_TAGS) {
    padded.push({
      name: "",
      color: TAG_PALETTE[padded.length % TAG_PALETTE.length]!,
    });
  }
  return padded.slice(0, MAX_USER_TAGS);
}

export function buildTagSettingsDraft(tags: UserTag[], ready = true): TagDraftRow[] {
  const source =
    tags.length > 0
      ? tags
      : ready
        ? DEFAULT_USER_TAGS.map((tag, index) => ({
            id: `new-${index}`,
            name: tag.name,
            color: tag.color,
            sort_order: index,
          }))
        : [];
  return padTagDraft(source.map((tag) => ({ name: formatTagLabel(tag.name), color: tag.color })));
}

export function draftRowsToPayload(rows: TagDraftRow[]): { name: string; color: string }[] {
  return rows
    .map((tag) => ({ name: normalizeTagName(tag.name), color: tag.color }))
    .filter((tag) => tag.name.length > 0);
}

export function userTagsToPayload(tags: UserTag[]): { name: string; color: string }[] {
  return tags.map((tag) => ({ name: normalizeTagName(tag.name), color: tag.color }));
}

export function tagPayloadsEqual(
  a: { name: string; color: string }[],
  b: { name: string; color: string }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag.name === b[index]?.name && tag.color === b[index]?.color);
}

/** True when next payload drops any name that exists in current (accidental wipe guard). */
export function payloadRemovesTagNames(
  current: { name: string }[],
  next: { name: string }[],
): boolean {
  const nextNames = new Set(next.map((tag) => normalizeTagName(tag.name)).filter(Boolean));
  return current.some((tag) => {
    const name = normalizeTagName(tag.name);
    return Boolean(name) && !nextNames.has(name);
  });
}

/** True when next has fewer tags than current (net deletion without explicit remove). */
export function payloadShrinksTagList(
  current: { name: string }[],
  next: { name: string }[],
): boolean {
  return next.length < current.length;
}

export function hasDuplicateTagNames(rows: TagDraftRow[]): boolean {
  const names = draftRowsToPayload(rows).map((tag) => tag.name);
  return new Set(names).size !== names.length;
}

export function countFilledTagDraft(rows: TagDraftRow[]): number {
  return rows.filter((tag) => tag.name.trim().length > 0).length;
}

export type TagDefinitionDiff = {
  renames: { from: string; to: string }[];
  removed: string[];
};

/** Detect renames (by row index) and removals when user tag definitions change. */
export function computeTagDefinitionDiff(
  oldTags: { name: string }[],
  newTags: { name: string }[],
): TagDefinitionDiff {
  const renames: { from: string; to: string }[] = [];
  const renamedFrom = new Set<string>();
  const oldNames = oldTags.map((tag) => tag.name);
  const newNames = new Set(newTags.map((tag) => tag.name));

  for (let i = 0; i < Math.min(oldTags.length, newTags.length); i += 1) {
    const from = oldTags[i]!.name;
    const to = newTags[i]!.name;
    if (from !== to) {
      renames.push({ from, to });
      renamedFrom.add(from);
    }
  }

  const removed = oldNames.filter((name) => !newNames.has(name) && !renamedFrom.has(name));
  return { renames, removed };
}

export function applyTagDefinitionDiffToTags(
  itemTags: string[],
  diff: TagDefinitionDiff,
): string[] {
  if (diff.removed.length === 0 && diff.renames.length === 0) return itemTags;

  const renameMap = new Map(diff.renames.map((entry) => [entry.from, entry.to]));
  const removedSet = new Set(diff.removed);
  const next: string[] = [];

  for (const tag of itemTags) {
    if (removedSet.has(tag)) continue;
    next.push(renameMap.get(tag) ?? tag);
  }

  return [...new Set(next)];
}

export function knownTagNames(userTags: UserTag[]): Set<string> {
  return new Set(userTags.map((tag) => normalizeTagName(tag.name)).filter(Boolean));
}

/** Register item tags that are missing from user settings. */
export async function ensureTagsRegistered(
  tagNames: string[],
  userTags: UserTag[],
  addTag: (name: string, color: string) => Promise<void>,
): Promise<void> {
  const known = knownTagNames(userTags);
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed || known.has(trimmed)) continue;
    await addTag(trimmed, colorForTag(trimmed, userTags));
    known.add(trimmed);
  }
}

export function alignItemTagsWithDefinitions(itemTags: string[], userTags: UserTag[]): string[] {
  const known = knownTagNames(userTags);
  return itemTags.filter((tag) => known.has(normalizeTagName(tag)));
}

/** Keep settings draft aligned with provider; respect in-flight saves and local edits. */
export function reconcileTagSettingsDraft(
  tags: UserTag[],
  draft: TagDraftRow[],
  pendingPayload: { name: string; color: string }[] | null,
): TagDraftRow[] {
  const providerPayload = userTagsToPayload(tags);
  const draftPayload = draftRowsToPayload(draft);

  if (tagPayloadsEqual(providerPayload, draftPayload)) {
    return draft;
  }

  if (pendingPayload && tagPayloadsEqual(draftPayload, pendingPayload)) {
    return draft;
  }

  const providerNames = new Set(providerPayload.map((tag) => tag.name));
  const draftNames = new Set(draftPayload.map((tag) => tag.name));
  const providerOnly = providerPayload.some((tag) => !draftNames.has(tag.name));
  const draftOnly = draftPayload.some((tag) => !providerNames.has(tag.name));

  if (providerOnly && draftOnly) {
    return draft;
  }

  if (providerOnly) {
    const merged = mergeProviderTagsIntoDraft(tags, draft);
    return merged ?? buildTagSettingsDraft(tags, true);
  }

  if (draftOnly) {
    return draft;
  }

  return buildTagSettingsDraft(tags, true);
}

/** Merge newly added provider tags into empty draft slots (e.g. wheel addTag) without restoring deletions. */
export function mergeProviderTagsIntoDraft(
  tags: UserTag[],
  draft: TagDraftRow[],
): TagDraftRow[] | null {
  const draftNames = new Set(draftRowsToPayload(draft).map((tag) => tag.name));
  const newcomers = tags.filter((tag) => !draftNames.has(normalizeTagName(tag.name)));
  if (newcomers.length === 0) return null;

  const next = draft.map((row) => ({ ...row }));
  for (const tag of newcomers) {
    const emptyIndex = next.findIndex((row) => !row.name.trim());
    if (emptyIndex < 0) break;
    next[emptyIndex] = { name: normalizeTagName(tag.name), color: tag.color };
  }
  return next;
}

function stableTagPaletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % TAG_PALETTE.length;
}

/** Same tag name → same color everywhere (settings, filters, items, wheel). */
export function colorForTag(name: string, tags: UserTag[]): string {
  const trimmed = normalizeTagName(name);
  if (!trimmed) return TAG_PALETTE[0]!;

  const fromSettings = tags.find((tag) => normalizeTagName(tag.name) === trimmed);
  if (fromSettings) return fromSettings.color;

  const fromDefaults = DEFAULT_USER_TAGS.find((tag) => tag.name === trimmed);
  if (fromDefaults) return fromDefaults.color;

  return TAG_PALETTE[stableTagPaletteIndex(trimmed)]!;
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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace("#", "").trim();
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function tagWheelChipFill(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const mix = 0.5;
  const cream = { r: 255, g: 254, b: 251 };
  return rgbToHex(
    rgb.r + (cream.r - rgb.r) * mix,
    rgb.g + (cream.g - rgb.g) * mix,
    rgb.b + (cream.b - rgb.b) * mix,
  );
}

export function tagItemChipFill(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "#f8fafc";
  const mix = 0.84;
  const cream = { r: 255, g: 254, b: 251 };
  return rgbToHex(
    rgb.r + (cream.r - rgb.r) * mix,
    rgb.g + (cream.g - rgb.g) * mix,
    rgb.b + (cream.b - rgb.b) * mix,
  );
}

export function tagWheelChipText(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "#57534e";
  const factor = 0.48;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

export function tagItemChipText(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "#94a3b8";
  const factor = 0.58;
  const stone = { r: 100, g: 116, b: 139 };
  const tinted = {
    r: rgb.r * factor + stone.r * 0.22,
    g: rgb.g * factor + stone.g * 0.22,
    b: rgb.b * factor + stone.b * 0.22,
  };
  return rgbToHex(tinted.r, tinted.g, tinted.b);
}

export function tagItemChipBorder(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "rgba(226, 232, 240, 0.65)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
}

export interface TagChipPresentation {
  gradientFrom: string;
  gradientTo: string;
  text: string;
  border: string;
  brush: string;
}

export function tagChipPresentation(color: string): TagChipPresentation {
  const rgb = hexToRgb(color);
  const gradientTo = tagWheelChipFill(color);
  if (!rgb) {
    return {
      gradientFrom: gradientTo,
      gradientTo,
      text: tagWheelChipText(color),
      border: `${color}44`,
      brush: color,
    };
  }
  const gradientFrom = rgbToHex(
    rgb.r + (255 - rgb.r) * 0.68,
    rgb.g + (255 - rgb.g) * 0.68,
    rgb.b + (255 - rgb.b) * 0.68,
  );
  const border = rgbToHex(
    rgb.r + (255 - rgb.r) * 0.55,
    rgb.g + (255 - rgb.g) * 0.55,
    rgb.b + (255 - rgb.b) * 0.55,
  );
  return {
    gradientFrom,
    gradientTo,
    text: tagWheelChipText(color),
    border,
    brush: color,
  };
}
