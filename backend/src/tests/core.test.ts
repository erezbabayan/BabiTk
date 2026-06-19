import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enforceEntityRules } from "../services/entity-rules.service.js";
import { resolveDueDateFromText } from "../services/hebrew-date-resolver.service.js";
import {
  buildFormattedAnalysis,
  computeNotifyAt,
  enrichParsedItemsWithAnalysis,
} from "../services/item-analysis.service.js";
import { normalizePhone } from "../services/items.service.js";
import { parseInputLocally } from "../services/local-parse.service.js";
import { isOpenAiUsable } from "../services/parse-input.service.js";
import { sanitizeInboundText } from "../utils/whatsapp.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2025-06-18T12:00:00+03:00");

describe("resolveDueDateFromText", () => {
  it("parses tomorrow at specific hour", () => {
    const due = resolveDueDateFromText("מחר ב-10 להתקשר למוסך", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.ok(due);
    assert.match(due, /2025-06-19T10:00:00\+03:00/);
  });

  it("parses weekday deadline", () => {
    const due = resolveDueDateFromText("לשלם חשמל עד יום חמישי", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.ok(due);
    assert.match(due, /2025-06-19T09:00:00\+03:00/);
  });

  it("parses tonight", () => {
    const due = resolveDueDateFromText("היום בערב לקנות חלב", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.ok(due);
    assert.match(due, /2025-06-18T19:00:00\+03:00/);
  });

  it("returns null when no temporal hint exists", () => {
    assert.equal(
      resolveDueDateFromText("לקנות חלב", { timezone: TZ, referenceDate: REF }),
      null,
    );
  });
});

describe("enforceEntityRules", () => {
  it("fills missing due_date for actionable items with temporal text", () => {
    const item = enforceEntityRules(
      {
        title: "מחר ב-10 להתקשר למוסך",
        content: "",
        is_actionable: true,
        due_date: null,
        tags: ["עבודה"],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "התקשרות למוסך; מועד: מחר 10:00",
          task: "להתקשר למוסך",
          urgency: "חסר",
          time_mention: "מחר ב-10",
        },
      },
      { timezone: TZ, referenceDate: REF },
    );

    assert.ok(item.due_date);
    assert.match(item.due_date!, /2025-06-19T10:00:00\+03:00/);
    assert.equal(item.title, "להתקשר למוסך");
  });

  it("clears due_date for notes", () => {
    const item = enforceEntityRules(
      {
        title: "קוד המחסן",
        content: "9845",
        is_actionable: false,
        due_date: "2025-06-19T10:00:00+03:00",
        tags: ["קודים"],
        analysis: {
          goal: "שמירת מידע לעיון",
          data_points: "קוד מחסן: 9845",
          task: "להתקשר למוסך",
          urgency: "חסר",
          time_mention: "חסר",
        },
      },
      { timezone: TZ, referenceDate: REF },
    );

    assert.equal(item.due_date, null);
    assert.equal(item.analysis.task, "חסר");
  });

  it("parses food prep for tomorrow", () => {
    const item = enforceEntityRules(
      {
        title: "להכין מחר אוכל לשבת",
        content: "",
        is_actionable: true,
        due_date: null,
        tags: ["כללי"],
        analysis: {
          goal: "תזכורת לביצוע פעולה",
          data_points: "הכנת אוכל לשבת; מועד: מחר",
          task: "להכין אוכל לשבת",
          urgency: "חסר",
          time_mention: "מחר",
        },
      },
      { timezone: TZ, referenceDate: REF },
    );

    assert.ok(item.due_date);
    assert.match(item.due_date!, /2025-06-19/);
    assert.equal(item.title, "להכין אוכל לשבת");
  });
});

describe("normalizePhone", () => {
  it("converts Israeli local to E.164", () => {
    assert.equal(normalizePhone("0501234567"), "+972501234567");
  });

  it("preserves international format", () => {
    assert.equal(normalizePhone("+14155552671"), "+14155552671");
  });
});

describe("parseInputLocally", () => {
  it("parses food prep for tomorrow without OpenAI", () => {
    const parsed = parseInputLocally({
      text: "להכין מחר אוכל לשבת",
      timezone: TZ,
      referenceDate: REF,
    });

    assert.equal(parsed.items.length, 1);
    const item = parsed.items[0]!;
    assert.equal(item.is_actionable, true);
    assert.ok(item.due_date);
    assert.match(item.due_date!, /2025-06-19/);
    assert.equal(item.title, "להכין אוכל לשבת");
  });

  it("detects placeholder OpenAI key as unusable", () => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-dev-placeholder";
    assert.equal(isOpenAiUsable(), false);
    process.env.OPENAI_API_KEY = original;
  });
});

describe("sanitizeInboundText", () => {
  it("rejects empty text", () => {
    const result = sanitizeInboundText("   ");
    assert.equal(result.accepted, false);
  });

  it("accepts meaningful text", () => {
    const result = sanitizeInboundText("קנה חלב מחר");
    assert.equal(result.accepted, true);
  });

  it("rejects emoji-only", () => {
    const result = sanitizeInboundText("👍🔥");
    assert.equal(result.accepted, false);
  });
});

describe("item analysis enrichment", () => {
  it("injects source label and formatted response", () => {
    const [item] = enrichParsedItemsWithAnalysis(
      [
        {
          title: "להתקשר למוסך",
          content: "",
          is_actionable: true,
          due_date: "2025-06-19T10:00:00+03:00",
          tags: ["עבודה"],
          analysis: {
            goal: "תזכורת לביצוע פעולה",
            data_points: "התקשרות למוסך; מועד: מחר 10:00",
            task: "להתקשר למוסך",
            urgency: "גבוהה",
            time_mention: "מחר ב-10",
          },
        },
      ],
      {
        sourceType: "whatsapp_text",
        sourceText: "מחר ב-10 להתקשר למוסך, דחוף",
        referenceDate: REF,
      },
    );

    assert.equal(item.analysis.source, "וואטסאפ (טקסט)");
    assert.match(item.analysis.formatted, /מטרה:/);
    assert.match(item.analysis.formatted, /רמת_דחיפות: גבוהה/);
    assert.ok(item.analysis.notify_at);
    assert.equal(item.analysis.time_mention, "חסר");
    assert.equal(item.analysis.data_points, "התקשרות למוסך");
  });

  it("drops relative time when due date is resolved", () => {
    const [item] = enrichParsedItemsWithAnalysis(
      [
        {
          title: "להכין אוכל לשבת",
          content: "",
          is_actionable: true,
          due_date: "2025-06-19T09:00:00+03:00",
          tags: ["כללי"],
          analysis: {
            goal: "תזכורת לביצוע פעולה",
            data_points: "להכין אוכל לשבת; מועד: מחר",
            task: "להכין אוכל לשבת",
            urgency: "חסר",
            time_mention: "מחר",
          },
        },
      ],
      {
        sourceType: "whatsapp_text",
        sourceText: "להכין מחר אוכל לשבת",
        referenceDate: REF,
      },
    );

    assert.equal(item.analysis.time_mention, "חסר");
    assert.equal(item.analysis.data_points, "להכין אוכל לשבת");
    assert.ok(item.analysis.target_at);
  });

  it("computes notify_at 30 minutes before high urgency tasks", () => {
    const target = "2025-06-19T10:00:00+03:00";
    const notify = computeNotifyAt(target, "גבוהה", TZ, REF);
    assert.equal(notify, "2025-06-19T06:30:00.000Z");
  });

  it("builds fixed Hebrew template", () => {
    const formatted = buildFormattedAnalysis({
      goal: "שמירת מידע לעיון",
      source: "סריקת מסמך",
      data_points: "קוד מחסן: 9845",
      task: "חסר",
      urgency: "חסר",
      time_mention: "חסר",
      target_at: null,
      notify_at: null,
      formatted: "",
    });

    assert.equal(
      formatted,
      [
        "מטרה: שמירת מידע לעיון",
        "מקור_מידע: סריקת מסמך",
        "נתונים: קוד מחסן: 9845",
        "משימה: חסר",
        "רמת_דחיפות: חסר",
        "איזכור_זמן: חסר",
        "מועד_יעד: חסר",
        "מועד_התראה: חסר",
      ].join("\n"),
    );
  });
});
