import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSupabaseIngestRows } from "./supabase-ingest-rows.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2025-06-18T12:00:00+03:00");

describe("buildSupabaseIngestRows", () => {
  it("parses a Hebrew due date into due_date and notify_at", () => {
    const rows = buildSupabaseIngestRows(
      "user-1",
      "מחר ב-10 להתקשר למוסך",
      { timezone: TZ, nowMs: REF.getTime(), referenceDate: REF },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.is_actionable, true);
    assert.ok(rows[0]?.due_date);
    assert.match(rows[0]?.due_date ?? "", /2025-06-19T10:00:00/);
    const analysis = rows[0]?.metadata.analysis as { notify_at?: string | null };
    assert.ok(analysis?.notify_at);
  });

  it("returns no rows for empty text", () => {
    assert.deepEqual(buildSupabaseIngestRows("user-1", "   "), []);
  });
});
