export function normalizeItemKey(title: string, content = ""): string {
  return `${title} ${content}`
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDuplicateCapture(
  candidate: { title: string; content?: string },
  existing: Array<{ title: string; content?: string | null }>,
): boolean {
  const key = normalizeItemKey(candidate.title, candidate.content ?? "");
  if (key.length < 4) return false;
  return existing.some(
    (row) => normalizeItemKey(row.title, row.content ?? "") === key,
  );
}

export function filterDuplicateParsedItems<
  T extends { title: string; content?: string },
>(parsed: T[], existing: Array<{ title: string; content?: string | null }>): T[] {
  const kept: T[] = [];
  const seen = existing.map((row) => normalizeItemKey(row.title, row.content ?? ""));
  for (const item of parsed) {
    const key = normalizeItemKey(item.title, item.content ?? "");
    if (key.length >= 4 && seen.includes(key)) continue;
    seen.push(key);
    kept.push(item);
  }
  return kept;
}
