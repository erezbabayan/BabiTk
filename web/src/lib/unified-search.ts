import { filterItemsByQuery } from "./filter-items";
import type { MindtaskerItem } from "../types";

export interface SemanticSearchHit {
  id: string;
}

/** Text matches first, then semantic-only hits from the same item pool. */
export function mergeSearchResults(
  items: MindtaskerItem[],
  query: string,
  semanticHits: readonly SemanticSearchHit[],
): MindtaskerItem[] {
  const textFiltered = filterItemsByQuery(items, query);
  const q = query.trim();
  if (q.length < 2 || semanticHits.length === 0) {
    return textFiltered;
  }

  const seen = new Set(textFiltered.map((item) => item.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const extras: MindtaskerItem[] = [];

  for (const hit of semanticHits) {
    if (seen.has(hit.id)) continue;
    const item = byId.get(hit.id);
    if (!item) continue;
    extras.push(item);
    seen.add(hit.id);
  }

  return [...textFiltered, ...extras];
}
