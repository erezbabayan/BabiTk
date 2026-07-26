import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseInputLocally } from "../services/local-parse.service.js";
import { trySplitTopicActions } from "../lib/ingest/topicTaskSplit.js";
import {
  applyLearnedTagLessons,
  deriveLessonsFromCorrection,
} from "../lib/ingest/ingestLearning.js";

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

describe("topic multi-task split", () => {
  it("splits studies checklist into separate actions with לימודים tag", () => {
    const text =
      "בלימודים צריך לעשות: להגיש עבודה, לקרוא מאמר, להתכונן למבחן";
    const split = trySplitTopicActions(text, ALLOWED);
    assert.ok(split);
    assert.equal(split!.actions.length, 3);
    assert.ok(split!.sharedTags.includes("לימודים"));
    assert.ok(!split!.sharedTags.includes("עבודה"));

    const parsed = parseInputLocally({
      text,
      allowedTags: ALLOWED,
      timezone: "Asia/Jerusalem",
      referenceDate: new Date("2026-07-13T12:00:00+03:00"),
    });
    assert.equal(parsed.items.length, 3);
    for (const item of parsed.items) {
      assert.ok(item.tags.includes("לימודים"), JSON.stringify(item));
      assert.ok(!item.tags.includes("עבודה"), JSON.stringify(item));
    }
  });

  it("splits bare letter list א, ב, ג, ד", () => {
    const text = "צריך לעשות א, ב, ג, ד";
    const split = trySplitTopicActions(text, ALLOWED);
    assert.ok(split);
    assert.equal(split!.actions.length, 4);

    const parsed = parseInputLocally({
      text,
      allowedTags: ALLOWED,
      timezone: "Asia/Jerusalem",
    });
    assert.equal(parsed.items.length, 4);
  });

  it("does not split single studies assignment", () => {
    const text = "בלימודים להגיש עבודה עד יום ראשון";
    const split = trySplitTopicActions(text, ALLOWED);
    assert.equal(split, null);

    const parsed = parseInputLocally({
      text,
      allowedTags: ALLOWED,
      timezone: "Asia/Jerusalem",
    });
    assert.equal(parsed.items.length, 1);
    assert.ok(parsed.items[0]!.tags.includes("לימודים"));
  });
});

describe("ingest learning from corrections", () => {
  it("derives tag_remap lesson when user fixes עבודה → לימודים", () => {
    const lessons = deriveLessonsFromCorrection({
      sourceText: "בלימודים להגיש עבודה ביום ראשון",
      beforeTags: ["עבודה"],
      afterTags: ["לימודים"],
    });
    assert.ok(lessons.some((l) => l.kind === "tag_remap" && l.toValue === "לימודים"));
  });

  it("applies learned remap on similar future text", () => {
    const lessons = deriveLessonsFromCorrection({
      sourceText: "בלימודים להגיש עבודה ביום ראשון",
      beforeTags: ["עבודה"],
      afterTags: ["לימודים"],
    });
    const tags = applyLearnedTagLessons(
      ["עבודה"],
      "בלימודים להגיש עבודה בקורס היסטוריה",
      lessons,
      ALLOWED,
    );
    assert.ok(tags.includes("לימודים"));
    assert.ok(!tags.includes("עבודה"));
  });
});
