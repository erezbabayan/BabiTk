import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { enforceEntityRules } from "../services/entity-rules.service.js";
import { parseInputLocally } from "../services/local-parse.service.js";
import { resolveDueDateFromText } from "../services/hebrew-date-resolver.service.js";
import { summarizeTopicTitle } from "../lib/ingest/taskPresentation.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2026-06-24T12:00:00+03:00");

const HATS_VACATION_INPUT =
  "להכין כובעים לנופש באוגוסט ביחד עם אביה, צריך לשבת על זה ב-1.7";

const ALLOWED = ["בית", "עבודה", "סטארטאפ", "קודים", "רעיונות", "פיננסי", "משפחה"];

const HATS_VACATION_LONG =
  "להכין כובעים לנופש משפחה בביאן באוגוסט ביחד עם אביה , צריך לשבת על זה ב-1.7";

describe("task presentation — hats vacation example", () => {
  it("preserves full long capture text in content", () => {
    const item = enforceEntityRules(
      {
        title: HATS_VACATION_LONG,
        content: "",
        is_actionable: true,
        due_date: null,
        tags: [],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "חסר",
          task: HATS_VACATION_LONG,
          urgency: "חסר",
          time_mention: "ב-1.7",
        },
      },
      {
        allowedTags: ALLOWED,
        sourceText: HATS_VACATION_LONG,
        timezone: TZ,
        referenceDate: REF,
      },
    );

    assert.equal(item.title, "להכין כובעים לנופש");
    assert.equal(item.content, HATS_VACATION_LONG);
    assert.match(item.due_date ?? "", /2026-07-01T09:00:00\+03:00/);
  });

  it("derives short title and full content from long capture", () => {
    const item = enforceEntityRules(
      {
        title: HATS_VACATION_INPUT,
        content: "",
        is_actionable: true,
        due_date: null,
        tags: [],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "חסר",
          task: HATS_VACATION_INPUT,
          urgency: "חסר",
          time_mention: "ב-1.7",
        },
      },
      {
        allowedTags: ALLOWED,
        sourceText: HATS_VACATION_INPUT,
        timezone: TZ,
        referenceDate: REF,
      },
    );

    assert.equal(item.title, "להכין כובעים לנופש");
    assert.equal(item.content, HATS_VACATION_INPUT);
    assert.match(item.due_date ?? "", /2026-07-01T09:00:00\+03:00/);
  });

  it("local parser splits title/content for the same input", () => {
    const parsed = parseInputLocally({
      text: HATS_VACATION_INPUT,
      timezone: TZ,
      referenceDate: REF,
      allowedTags: ALLOWED,
    });

    assert.equal(parsed.items.length, 1);
    const item = parsed.items[0]!;
    assert.equal(item.title, "להכין כובעים לנופש");
    assert.equal(item.content, HATS_VACATION_INPUT);
    assert.match(item.due_date ?? "", /2026-07-01T09:00:00\+03:00/);
  });

  it("uses the planning date at the end (1.7) not August context", () => {
    const due = resolveDueDateFromText(HATS_VACATION_INPUT, {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.match(due ?? "", /2026-07-01T09:00:00\+03:00/);
  });
});

const WORLD_CUP_INPUT =
  "לראות בראשון הקרוב את גמר המוניאל בשעה עשר בלילה";

describe("task presentation — topic summary title", () => {
  it("world cup final → short topic title, full content, Sunday 22:00", () => {
    const item = enforceEntityRules(
      {
        title: WORLD_CUP_INPUT,
        content: "",
        is_actionable: true,
        due_date: null,
        tags: [],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "חסר",
          task: WORLD_CUP_INPUT,
          urgency: "חסר",
          time_mention: "בראשון הקרוב בשעה עשר בלילה",
        },
      },
      {
        allowedTags: ALLOWED,
        sourceText: WORLD_CUP_INPUT,
        timezone: TZ,
        referenceDate: REF,
      },
    );

    assert.equal(item.title, "גמר המונדיאל");
    assert.equal(item.content, WORLD_CUP_INPUT);
    assert.match(item.due_date ?? "", /2026-06-28T22:00:00\+03:00/);
  });

  it("local parser yields the same topic title", () => {
    const parsed = parseInputLocally({
      text: WORLD_CUP_INPUT,
      timezone: TZ,
      referenceDate: REF,
      allowedTags: ALLOWED,
    });

    assert.equal(parsed.items.length, 1);
    const item = parsed.items[0]!;
    assert.equal(item.title, "גמר המונדיאל");
    assert.equal(item.content, WORLD_CUP_INPUT);
    assert.match(item.due_date ?? "", /2026-06-28T22:00:00\+03:00/);
  });

  it("keeps meeting partner in title (שיחה עם…)", () => {
    const item = enforceEntityRules(
      {
        title: "שיחה עם המחט ביום ראשון בעשר בבוקר",
        content: "",
        is_actionable: true,
        due_date: null,
        tags: [],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "חסר",
          task: "שיחה עם המחט ביום ראשון בעשר בבוקר",
          urgency: "חסר",
          time_mention: "ביום ראשון בעשר בבוקר",
        },
      },
      {
        allowedTags: ALLOWED,
        sourceText: "שיחה עם המחט ביום ראשון בעשר בבוקר",
        timezone: TZ,
        referenceDate: REF,
      },
    );

    assert.equal(item.title, "שיחה עם המחט");
  });
});

describe("summarizeTopicTitle — topic method", () => {
  it("extracts et-object topics", () => {
    assert.equal(
      summarizeTopicTitle("לראות בראשון הקרוב את גמר המוניאל בשעה עשר בלילה"),
      "גמר המונדיאל",
    );
    assert.equal(
      summarizeTopicTitle("לשלם את החשבון של החשמל עד יום חמישי"),
      "החשבון של החשמל",
    );
  });

  it("keeps action+object for prep/buy/call", () => {
    assert.equal(
      summarizeTopicTitle("מחר בבוקר לקנות חלב"),
      "לקנות חלב",
    );
    assert.equal(
      summarizeTopicTitle("תזכיר לי להתקשר למוסך מחר ב-10"),
      "להתקשר למוסך",
    );
  });

  it("summarizes meetings and al-topics", () => {
    assert.equal(
      summarizeTopicTitle("פגישה עם דני ביום שלישי בשלוש בערב"),
      "פגישה עם דני",
    );
    assert.equal(
      summarizeTopicTitle("לכתוב על רעיון לסרטון מחר"),
      "רעיון לסרטון",
    );
  });
});
