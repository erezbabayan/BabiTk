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

  it("does not resurrect a soft-deleted notebook row from a later update", () => {
    const next = applyItemRealtimeChange<Row>(
      [],
      {
        eventType: "UPDATE",
        new: { id: "gone", title: "חזר", deleted_at: "2026-10-16T04:00:00.000Z" },
      },
    );
    assert.deepEqual(next, []);
  });

  it("replaces the optimistic capture row when the saved row arrives", () => {
    const next = applyItemRealtimeChange<Row & { metadata?: { client_capture_id?: string } }>(
      [{ id: "local-1", title: "חלב", metadata: { client_capture_id: "local-1" } }],
      {
        eventType: "INSERT",
        new: { id: "server-9", title: "חלב", metadata: { client_capture_id: "local-1" } },
      },
    );
    assert.deepEqual(next.map((row) => row.id), ["server-9"]);
  });

  it("does not re-insert an unknown row on UPDATE", () => {
    const next = applyItemRealtimeChange<Row>(
      [{ id: "a", title: "ישן" }],
      { eventType: "UPDATE", new: { id: "gone", title: "OCR" } },
    );
    assert.deepEqual(next.map((row) => row.id), ["a"]);
  });
});
