import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Item = { id: string; title: string; content: string; tags: string[] };

function filterItemsByQuery(items: Item[], query: string): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

function mergeSearchResults(
  items: Item[],
  query: string,
  semanticHits: readonly { id: string }[],
): Item[] {
  const textFiltered = filterItemsByQuery(items, query);
  const q = query.trim();
  if (q.length < 2 || semanticHits.length === 0) {
    return textFiltered;
  }

  const seen = new Set(textFiltered.map((item) => item.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const extras: Item[] = [];

  for (const hit of semanticHits) {
    if (seen.has(hit.id)) continue;
    const item = byId.get(hit.id);
    if (!item) continue;
    extras.push(item);
    seen.add(hit.id);
  }

  return [...textFiltered, ...extras];
}

describe("mergeSearchResults", () => {
  const items: Item[] = [
    { id: "1", title: "פגישה עם רופא", content: "", tags: [] },
    { id: "2", title: "קניות", content: "חלב ולחם", tags: ["בית"] },
    { id: "3", title: "תור", content: "מרפאה כללית", tags: [] },
  ];

  it("returns text matches only when semantic hits are empty", () => {
    const result = mergeSearchResults(items, "רופא", []);
    assert.deepEqual(result.map((item) => item.id), ["1"]);
  });

  it("appends semantic-only matches after text matches", () => {
    const result = mergeSearchResults(items, "רופא", [{ id: "3" }]);
    assert.deepEqual(result.map((item) => item.id), ["1", "3"]);
  });

  it("does not duplicate items already matched by text", () => {
    const result = mergeSearchResults(items, "רופא", [{ id: "1" }, { id: "3" }]);
    assert.deepEqual(result.map((item) => item.id), ["1", "3"]);
  });

  it("skips semantic hits outside the item pool", () => {
    const result = mergeSearchResults(items, "רופא", [{ id: "missing" }]);
    assert.deepEqual(result.map((item) => item.id), ["1"]);
  });
});
