import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIncomingMessage } from "../../../convex/lib/ingest/parseIncomingMessage.js";

const ALLOWED = [
  "בית",
  "עבודה",
  "לימודים",
  "סטארטאפ",
  "קודים",
  "רעיונות",
  "פיננסי",
  "משפחה",
];

const NOW = new Date("2026-09-17T12:00:00+03:00");

function parseOne(text: string) {
  const items = parseIncomingMessage(text, {
    allowedTags: ALLOWED,
    timezone: "Asia/Jerusalem",
    now: NOW,
  });
  assert.ok(items.length >= 1, `expected items for: ${text}`);
  return items[0]!;
}

describe("parseIncomingMessage — tag by context", () => {
  it("tags home chores as בית", () => {
    const item = parseOne("לקנות חלב בבית מחר");
    assert.ok(item.tags.includes("בית"), JSON.stringify(item.tags));
    assert.equal(item.is_actionable, true);
  });

  it("tags school assignment as לימודים, not עבודה", () => {
    const item = parseOne("בלימודים להגיש עבודה ביום ראשון");
    assert.ok(item.tags.includes("לימודים"), JSON.stringify(item.tags));
    assert.ok(!item.tags.includes("עבודה"), JSON.stringify(item.tags));
  });

  it("tags work meetings as עבודה", () => {
    const item = parseOne("ישיבת עבודה עם לקוח במשרד");
    assert.ok(item.tags.includes("עבודה"), JSON.stringify(item.tags));
  });

  it("tags passwords as קודים and a note", () => {
    const item = parseOne("קוד wifi: 12345678");
    assert.ok(item.tags.includes("קודים"), JSON.stringify(item.tags));
    assert.equal(item.is_actionable, false);
  });

  it("tags ideas as רעיונות", () => {
    const item = parseOne("רעיון לאפליקציה חדשה לניהול משימות");
    assert.ok(item.tags.includes("רעיונות"), JSON.stringify(item.tags));
  });

  it("tags family context as משפחה", () => {
    const item = parseOne("לאסוף את הילדים מהגן");
    assert.ok(item.tags.includes("משפחה"), JSON.stringify(item.tags));
  });

  it("tags finance as פיננסי", () => {
    const item = parseOne("לשלם חשבון חשמל וכסף לביטוח");
    assert.ok(item.tags.includes("פיננסי"), JSON.stringify(item.tags));
  });

  it("tags startup keywords", () => {
    const item = parseOne("פגישת founder על MVP בסטארטאפ");
    assert.ok(item.tags.includes("סטארטאפ"), JSON.stringify(item.tags));
  });

  it("sets a due date for מחר on an actionable chore", () => {
    const item = parseOne("לקנות חלב בבית מחר");
    assert.ok(item.due_date, "expected due_date");
    assert.match(item.due_date!, /^2026-09-18T/);
  });

  it("returns no items for empty text", () => {
    assert.deepEqual(parseIncomingMessage("   "), []);
  });

  it("parses a WhatsApp-style inbound line into a tagged task", () => {
    const item = parseOne("תזכיר לי לשלם לגן של הילדים מחר");
    assert.ok(item.tags.includes("משפחה") || item.tags.includes("פיננסי"), JSON.stringify(item.tags));
    assert.equal(item.is_actionable, true);
    assert.ok(item.due_date);
  });
});
