import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261112090000_user_notifications_item_id_index.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("user_notifications.item_id index migration", () => {
  it("is additive and idempotent (create index if not exists, no RLS or data changes)", () => {
    assert.match(
      migration,
      /create index if not exists user_notifications_item_id_idx\s+on public\.user_notifications \(item_id\)/i,
    );
    const sql = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    for (const forbidden of [/\bpolicy\b/i, /\bdrop\b/i, /\balter\b/i, /\bdelete\b/i, /\bupdate\b/i, /\bconcurrently\b/i]) {
      assert.doesNotMatch(sql, forbidden);
    }
  });
});
