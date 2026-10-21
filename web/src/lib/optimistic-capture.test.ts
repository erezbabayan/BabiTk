import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientCaptureId, mergeOptimisticRows } from "./optimistic-capture.ts";

describe("mergeOptimisticRows", () => {
  it("keeps a local row until the saved row carries the same capture id", () => {
    const pending = [
      {
        id: "local-1",
        title: "חלב",
        metadata: { client_capture_id: "local-1" },
      },
    ];
    const beforeSave = mergeOptimisticRows([{ id: "old", title: "ישן" }], pending);
    assert.deepEqual(beforeSave.map((row) => row.id), ["local-1", "old"]);

    const afterSave = mergeOptimisticRows(
      [
        {
          id: "server-9",
          title: "חלב",
          metadata: { client_capture_id: "local-1" },
        },
      ],
      pending,
    );
    assert.deepEqual(afterSave.map((row) => row.id), ["server-9"]);
    assert.equal(clientCaptureId(afterSave[0]!), "local-1");
  });
});
