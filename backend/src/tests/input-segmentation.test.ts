import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseInputLocally } from "../services/local-parse.service.js";
import { enforceIngestionRules } from "../services/entity-rules.service.js";
import {
  mergeContinuationParsedItems,
  splitInputSegments,
} from "../lib/ingest/inputSegmentation.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2026-06-22T12:00:00+03:00");
const ALLOWED = ["בית", "עבודה", "סטארטאפ", "קודים", "רעיונות", "פיננסי", "משפחה"];

const HATS_ADVANCE_INPUT =
  "להכין עם אביה כובעים לנופש בביאן באוגוסט, לקדם את זה בתחילת שבוע הבא";

describe("input segmentation — planning continuation", () => {
  it("does not split on comma before לקדם את זה", () => {
    const segments = splitInputSegments(HATS_ADVANCE_INPUT);
    assert.equal(segments.length, 1);
    assert.equal(segments[0], HATS_ADVANCE_INPUT);
  });

  it("still splits independent tasks after comma", () => {
    const segments = splitInputSegments("לקנות חלב, לשלוח מייל ליוסי");
    assert.equal(segments.length, 2);
  });

  it("splits voice-style וגם list into separate tasks", () => {
    const segments = splitInputSegments(
      "לקנות חלב וגם לשלוח מייל ליוסי וגם להתקשר לאמא",
    );
    assert.equal(segments.length, 3);
  });

  it("enforceIngestionRules expands AI single item into multiple tasks", () => {
    const source =
      "לקנות חלב וגם לשלוח מייל ליוסי וגם להתקשר לאמא";
    const ruled = enforceIngestionRules(
      {
        items: [
          {
            title: "קניות ותזכורות",
            content: source,
            is_actionable: true,
            due_date: null,
            tags: ["בית"],
            analysis: {
              goal: "תזכורת לביצוע פעולה",
              data_points: "חסר",
              task: "לקנות חלב",
              urgency: "חסר",
              time_mention: "חסר",
            },
          },
        ],
      },
      {
        sourceText: source,
        allowedTags: ALLOWED,
        timezone: TZ,
        referenceDate: REF,
      },
    );
    assert.equal(ruled.items.length, 3);
    assert.ok(ruled.items.every((item) => item.is_actionable));
  });

  it("local parser returns one item with title and full content", () => {
    const parsed = parseInputLocally({
      text: HATS_ADVANCE_INPUT,
      timezone: TZ,
      referenceDate: REF,
      allowedTags: ALLOWED,
    });

    assert.equal(parsed.items.length, 1);
    const item = parsed.items[0]!;
    assert.equal(item.title, "להכין כובעים לנופש");
    assert.equal(item.content, HATS_ADVANCE_INPUT);
  });

  it("merges AI-over-split items via enforceIngestionRules", () => {
    const ruled = enforceIngestionRules(
      {
        items: [
          {
            title: "להכין עם אביה כובעים לנופש בביאן באוגוסט",
            content: "",
            is_actionable: true,
            due_date: null,
            tags: ["משפחה"],
            analysis: {
              goal: "תזכורת לביצוע פעולה",
              data_points: "חסר",
              task: "להכין כובעים",
              urgency: "חסר",
              time_mention: "באוגוסט",
            },
          },
          {
            title: "לקדם את זה בתחילת שבוע הבא",
            content: "",
            is_actionable: true,
            due_date: null,
            tags: ["משפחה"],
            analysis: {
              goal: "תזכורת לביצוע פעולה",
              data_points: "חסר",
              task: "לקדם את זה",
              urgency: "חסר",
              time_mention: "בתחילת שבוע הבא",
            },
          },
        ],
      },
      {
        sourceText: HATS_ADVANCE_INPUT,
        allowedTags: ALLOWED,
        timezone: TZ,
        referenceDate: REF,
      },
    );

    assert.equal(ruled.items.length, 1);
    assert.equal(ruled.items[0]!.content, HATS_ADVANCE_INPUT);
    assert.equal(ruled.items[0]!.title, "להכין כובעים לנופש");
  });

  it("mergeContinuationParsedItems combines continuation pair", () => {
    const merged = mergeContinuationParsedItems(
      [
        {
          title: "להכין כובעים",
          content: "",
          is_actionable: true,
          due_date: null,
          tags: [],
          analysis: {
            goal: "חסר",
            data_points: "חסר",
            task: "חסר",
            urgency: "חסר",
            time_mention: "חסר",
          },
        },
        {
          title: "לקדם את זה בתחילת שבוע הבא",
          content: "",
          is_actionable: true,
          due_date: null,
          tags: [],
          analysis: {
            goal: "חסר",
            data_points: "חסר",
            task: "חסר",
            urgency: "חסר",
            time_mention: "חסר",
          },
        },
      ],
      HATS_ADVANCE_INPUT,
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.content, HATS_ADVANCE_INPUT);
  });
});
