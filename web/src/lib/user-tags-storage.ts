import { DEFAULT_USER_TAGS, normalizeTagName, type UserTag } from "./tags";

const STORAGE_KEY = "mindtasker:user-tags-local";

export function demoTagsLocal(): UserTag[] {
  return DEFAULT_USER_TAGS.map((tag, index) => ({
    id: `demo-${index}`,
    name: tag.name,
    color: tag.color,
    sort_order: index,
  }));
}

export function toUserTags(rows: { name: string; color: string }[]): UserTag[] {
  return rows.map((tag, index) => ({
    id: `local-${index}-${tag.name}`,
    name: normalizeTagName(tag.name),
    color: tag.color,
    sort_order: index,
  }));
}

export function loadStoredUserTags(): UserTag[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name: string; color: string }[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return toUserTags(parsed);
  } catch {
    return null;
  }
}

export function saveStoredUserTags(rows: { name: string; color: string }[]): UserTag[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  return toUserTags(rows);
}
