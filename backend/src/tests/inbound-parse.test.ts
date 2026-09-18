import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseInboundText } from "../../../convex/lib/ingest/supabaseIngestRows.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2025-06-18T12:00:00+03:00");

describe("parseInboundText", () => {
  it("parses a WhatsApp Hebrew due date into due_date and notify_at", () => {
    const items = parseInboundText("מחר ב-10 להתקשר למוסך", {
      sourceType: "whatsapp_text",
      timezone: TZ,
      referenceDate: REF,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.is_actionable, true);
    assert.ok(items[0]?.due_date);
    assert.match(items[0]?.due_date ?? "", /2025-06-19T10:00:00/);
    const analysis = items[0]?.analysis as { notify_at?: string | null; source?: string };
    assert.ok(analysis?.notify_at);
    assert.equal(analysis?.source, "וואטסאפ");
  });

  it("returns no items for empty text", () => {
    assert.deepEqual(parseInboundText("   ", { sourceType: "whatsapp_text" }), []);
  });

  it("does not copy the full dictation into content for a title+schedule capture", () => {
    const items = parseInboundText("מחר ב-10 להתקשר למוסך", {
      sourceType: "whatsapp_text",
      timezone: TZ,
      referenceDate: REF,
    });
    assert.equal(items[0]?.content, "");
    assert.equal(items[0]?.title, "להתקשר למוסך");
  });
});
