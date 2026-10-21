import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRestoreFromArchivePatch } from "./item-restore.ts";

describe("resolveRestoreFromArchivePatch", () => {
  it("restores completed tasks onto the tasks board", () => {
    const patch = resolveRestoreFromArchivePatch({
      status: "completed",
      is_actionable: true,
      completed_at: "2026-10-20T10:00:00.000Z",
      metadata: { extra: true },
    });
    assert.equal(patch.status, "pending");
    assert.equal(patch.completed_at, null);
  });

  it("restores snoozed tasks using the saved pre-archive status", () => {
    const patch = resolveRestoreFromArchivePatch({
      status: "snoozed_archive",
      is_actionable: true,
      completed_at: null,
      metadata: { pre_archive_status: "pending" },
    });
    assert.equal(patch.status, "pending");
    assert.equal(patch.completed_at, null);
  });
});
