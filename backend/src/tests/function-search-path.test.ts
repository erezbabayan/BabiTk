import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261114190000_fix_function_search_path.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const sql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("function search_path migration (Security Advisor 0011)", () => {
  it("pins search_path on the three flagged functions", () => {
    for (const fn of [
      /public\.set_updated_at\(\)/,
      /public\.sync_item_completed_at\(\)/,
      /public\.search_notes\(vector, integer, double precision\)/,
    ]) {
      assert.match(sql, new RegExp(`alter function ${fn.source} set search_path = public;`, "i"));
    }
  });

  it("only alters function config (no body, RLS, grant or data changes)", () => {
    for (const forbidden of [
      /\bcreate\b/i,
      /\breplace\b/i,
      /\bdrop\b/i,
      /\bpolicy\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\bdelete\b/i,
      /\bupdate\b/i,
      /\binsert\b/i,
      /security\s+definer/i,
    ]) {
      assert.doesNotMatch(sql, forbidden);
    }
    assert.equal((sql.match(/alter function/gi) ?? []).length, 3);
  });
});
