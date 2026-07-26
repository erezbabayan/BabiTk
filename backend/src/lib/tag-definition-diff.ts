export type TagDefinitionDiff = {
  renames: { from: string; to: string }[];
  removed: string[];
};

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
