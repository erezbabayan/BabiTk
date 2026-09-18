import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyItemRealtimeChange } from "./realtime-items.ts";

type Row = { id: string; title: string; deleted_at?: string | null; source_materials?: { id: string } | null };

describe("applyItemRealtimeChange", () => {
  it("inserts a new row at the front", () => {
    const next = applyItemRealtimeChange<Row>(
      [{ id: "a", title: "ישן" }],
      { eventType: "INSERT", new: { id: "b", title: "חדש" } },
    );
    assert.deepEqual(next.map((row) => row.id), ["b", "a"]);
  });

  it("merges updates without dropping nested source_materials", () => {
    const next = applyItemRealtimeChange<Row>(
      [{ id: "a", title: "ישן", source_materials: { id: "src" } }],
      { eventType: "UPDATE", new: { id: "a", title: "מעודכן" } },
    );
    assert.equal(next[0]?.title, "מעודכן");
    assert.deepEqual(next[0]?.source_materials, { id: "src" });
  });

  it("removes deleted rows", () => {
    const next = applyItemRealtimeChange<Row>(
      [{ id: "a", title: "פריט" }],
      { eventType: "DELETE", old: { id: "a" } },
    );
    assert.deepEqual(next, []);
  });
});
