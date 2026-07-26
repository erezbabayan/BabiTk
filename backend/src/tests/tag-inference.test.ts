import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { enforceEntityRules } from "../services/entity-rules.service.js";
import {
  inferTagsFromText,
  mergeInferredTags,
} from "../lib/ingest/tagInference.js";

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

describe("tag inference", () => {
  it("detects startup keywords in Hebrew", () => {
    const text = "חיבור להקלטת קולית של משימות בסטארטאפ";
    assert.ok(inferTagsFromText(text, ALLOWED).includes("סטארטאפ"));
  });

  it("detects startup keywords in English", () => {
    assert.ok(inferTagsFromText("Meeting with startup founders", ALLOWED).includes("סטארטאפ"));
  });

  it("detects tag name mentioned in Hebrew text", () => {
    const text = "מחר לבצע את העבודה";
    assert.ok(inferTagsFromText(text, ALLOWED).includes("עבודה"));
  });

  it("detects work tag in meeting text even without allowedTags list", () => {
    const text = "יש ישיבת עבודה בבוסתני חפץ";
    assert.ok(inferTagsFromText(text).includes("עבודה"));
  });

  it("tags school assignment under לימודים not עבודה", () => {
    const text = "בלימודים להגיש עבודה ביום ראשון בתאריך 20.7";
    const tags = inferTagsFromText(text, ALLOWED);
    assert.ok(tags.includes("לימודים"), `expected לימודים in ${JSON.stringify(tags)}`);
    assert.ok(!tags.includes("עבודה"), `did not expect עבודה in ${JSON.stringify(tags)}`);
  });

  it("tags academic homework without explicit לימודים word", () => {
    const text = "להגיש עבודת בית בקורס מתמטיקה עד יום חמישי";
    const tags = inferTagsFromText(text, ALLOWED);
    assert.ok(tags.includes("לימודים"));
    assert.ok(!tags.includes("עבודה"));
  });

  it("keeps job work tag for office meetings", () => {
    const text = "ישיבת עבודה עם הלקוח במשרד מחר";
    const tags = inferTagsFromText(text, ALLOWED);
    assert.ok(tags.includes("עבודה"));
    assert.ok(!tags.includes("לימודים"));
  });

  it("enforceEntityRules prefers לימודים for school submit task", () => {
    const item = enforceEntityRules(
      {
        title: "להגיש עבודה",
        content: "בלימודים להגיש עבודה בתאריך 20.7",
        is_actionable: true,
        due_date: null,
        tags: ["עבודה"],
        analysis: {
          goal: "חסר",
          data_points: "חסר",
          task: "חסר",
          urgency: "חסר",
          time_mention: "חסר",
        },
      },
      {
        allowedTags: ALLOWED,
        sourceText: "בלימודים להגיש עבודה בתאריך 20.7",
      },
    );

    assert.ok(item.tags.includes("לימודים"));
    assert.ok(!item.tags.includes("עבודה"));
  });

  it("replaces generic כללי with inferred work tag", () => {
    const item = enforceEntityRules(
      {
        title: "יש ישיבת עבודה בבוסתני חפץ",
        content: "",
        is_actionable: true,
        due_date: null,
        tags: ["כללי"],
        analysis: {
          goal: "חסר",
          data_points: "חסר",
          task: "חסר",
          urgency: "חסר",
          time_mention: "חסר",
        },
      },
      {
        sourceText: "יש ישיבת עבודה בבוסתני חפץ",
      },
    );

    assert.ok(item.tags.includes("עבודה"));
    assert.ok(!item.tags.includes("כללי"));
  });

  it("applies work tag when tag name appears in task title", () => {
    const item = enforceEntityRules(
      {
        title: "מחר לבצע את העבודה",
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
        allowedTags: ALLOWED,
        sourceText: "מחר לבצע את העבודה",
      },
    );

    assert.ok(item.tags.includes("עבודה"));
  });

  it("merges inferred tags with parser output", () => {
    const merged = mergeInferredTags(["עבודה"], "לעבוד על MVP בסטארטאפ", ALLOWED);
    assert.ok(merged.includes("עבודה"));
    assert.ok(merged.includes("סטארטאפ"));
  });

  it("prefers custom tag name and drops unsupported financial guess", () => {
    const text = "סגירת פרויקט בעבודה";
    const allowed = [...ALLOWED, "סגירת פרויקט"];
    const tags = inferTagsFromText(text, allowed);
    assert.ok(tags.includes("סגירת פרויקט"), `expected סגירת פרויקט in ${JSON.stringify(tags)}`);
    assert.ok(tags.includes("עבודה"), `expected עבודה in ${JSON.stringify(tags)}`);
    assert.ok(!tags.includes("פיננסי"), `did not expect פיננסי in ${JSON.stringify(tags)}`);

    const merged = mergeInferredTags(["עבודה", "פיננסי"], text, allowed);
    assert.ok(merged.includes("סגירת פרויקט"), `expected סגירת פרויקט in ${JSON.stringify(merged)}`);
    assert.ok(merged.includes("עבודה"), `expected עבודה in ${JSON.stringify(merged)}`);
    assert.ok(!merged.includes("פיננסי"), `did not expect פיננסי in ${JSON.stringify(merged)}`);
  });

  it("keeps financial tag when text has money cues", () => {
    const text = "לשלם חשבונית לבנק";
    const tags = inferTagsFromText(text, ALLOWED);
    assert.ok(tags.includes("פיננסי"), `expected פיננסי in ${JSON.stringify(tags)}`);
  });

  it("applies startup tag via enforceEntityRules when text mentions startup", () => {
    const item = enforceEntityRules(
      {
        title: "חיבור להקלטת קולית של משימות בסטארטאפ",
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
        allowedTags: ALLOWED,
        sourceText: "חיבור להקלטת קולית של משימות בסטארטאפ",
      },
    );

    assert.ok(item.tags.includes("סטארטאפ"));
    assert.ok(!item.tags.includes("כללי"));
  });
});
