import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTEXT_PARSED_AT_KEY,
  contextParsePatch,
  itemNeedsContextParse,
  parseIncomingMessage,
} from "./parse-incoming-message.js";
import { VOICE_PENDING_TITLE } from "./voice-text.js";

const NOW = new Date("2026-09-17T12:00:00+03:00");
const ALLOWED = ["בית", "עבודה", "לימודים", "סטארטאפ", "קודים", "רעיונות", "פיננסי", "משפחה"];

describe("itemNeedsContextParse", () => {
  it("skips items already stamped as parsed", () => {
    assert.equal(
      itemNeedsContextParse({
        title: "לקנות חלב",
        content: "לקנות חלב",
        tags: ["בית"],
        metadata: { [CONTEXT_PARSED_AT_KEY]: "2026-09-17T09:00:00.000Z" },
        created_at: "2026-09-17T09:00:00.000Z",
      }),
      false,
    );
  });

  it("skips voice placeholders until they are transcribed", () => {
    assert.equal(
      itemNeedsContextParse({
        title: VOICE_PENDING_TITLE,
        content: "הודעה קולית מוואטסאפ",
        tags: [],
        metadata: { source: "whatsapp_voice" },
        created_at: new Date().toISOString(),
      }),
      false,
    );
  });

  it("parses a recent untagged inbound message", () => {
    assert.equal(
      itemNeedsContextParse({
        title: "לקנות חלב בבית",
        content: "לקנות חלב בבית",
        tags: [],
        metadata: { source: "whatsapp_text" },
        created_at: new Date().toISOString(),
      }),
      true,
    );
  });
});

describe("contextParsePatch", () => {
  it("applies בית and a due date from context", () => {
    const patch = contextParsePatch(
      {
        title: "לקנות חלב בבית מחר",
        content: "לקנות חלב בבית מחר",
        metadata: { source: "whatsapp_text" },
      },
      ALLOWED,
      NOW,
    );
    assert.ok(patch);
    assert.ok(patch.tags?.includes("בית"), JSON.stringify(patch.tags));
    assert.equal(patch.is_actionable, true);
    assert.ok(patch.due_date);
    assert.match(String(patch.due_date), /^2026-09-18T/);
    assert.ok(
      patch.metadata &&
        typeof patch.metadata === "object" &&
        CONTEXT_PARSED_AT_KEY in patch.metadata,
    );
  });
});

describe("parseIncomingMessage from web", () => {
  it("tags a work meeting and a family pickup", () => {
    const work = parseIncomingMessage("ישיבת עבודה עם לקוח במשרד", {
      allowedTags: ALLOWED,
      now: NOW,
    })[0];
    assert.ok(work?.tags.includes("עבודה"));
    const family = parseIncomingMessage("לאסוף את הילדים מהגן", {
      allowedTags: ALLOWED,
      now: NOW,
    })[0];
    assert.ok(family?.tags.includes("משפחה"));
  });
});
