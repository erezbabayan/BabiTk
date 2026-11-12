import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyOptimisticPatch,
  mergeServerRow,
  rollbackOptimisticPatch,
  snapshotPatchedFields,
} from "./optimistic-patch.ts";

type Item = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  source_materials?: { id: string } | null;
};

const items: Item[] = [
  { id: "a", title: "A", status: "pending", tags: [], source_materials: { id: "s1" } },
  { id: "b", title: "B", status: "inbox", tags: ["x"] },
];

describe("mobile optimistic patch", () => {
  it("applies the patch immediately to the matching item only", () => {
    const next = applyOptimisticPatch(items, "a", { status: "completed" });
    assert.equal(next[0].status, "completed");
    assert.equal(next[1], items[1]);
    assert.equal(items[0].status, "pending", "input not mutated");
  });

  it("returns the same array when the item is not on the board", () => {
    assert.equal(applyOptimisticPatch(items, "zzz", { status: "completed" }), items);
  });

  it("rolls back only the patched fields, keeping concurrent realtime changes", () => {
    const snapshot = snapshotPatchedFields(items[0], { status: "completed" });
    let next = applyOptimisticPatch(items, "a", { status: "completed" });
    next = applyOptimisticPatch(next, "a", { title: "A (edited on web)" });
    next = rollbackOptimisticPatch(next, "a", snapshot);
    assert.equal(next[0].status, "pending");
    assert.equal(next[0].title, "A (edited on web)");
  });

  it("no snapshot (item was not on the board) is a no-op rollback", () => {
    assert.equal(snapshotPatchedFields<Item>(undefined, { status: "x" }), null);
    assert.equal(rollbackOptimisticPatch(items, "a", null), items);
  });

  it("merges the server row but keeps the joined source material", () => {
    const next = mergeServerRow(items, { id: "a", status: "completed", source_materials: null });
    assert.equal(next[0].status, "completed");
    assert.deepEqual(next[0].source_materials, { id: "s1" });
    assert.equal(mergeServerRow(items, null), items);
  });
});
