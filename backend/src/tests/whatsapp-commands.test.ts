import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseWhatsAppCommand,
  resolveCommandItemId,
  buildCaptureConfirmation,
} from "../lib/whatsapp-commands.js";
import {
  parseWhatsAppQuery,
  parseMenuSelection,
  isWhatsAppMenuRequest,
  builtInMenuQuestions,
  buildWhatsAppMenuText,
  buildTaskBriefing,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
} from "../lib/whatsapp-query.js";

describe("WhatsApp commands", () => {
  it("parses complete / snooze / tomorrow replies", () => {
    assert.deepEqual(parseWhatsAppCommand("בוצע"), {
      type: "complete",
      index: null,
    });
    assert.deepEqual(parseWhatsAppCommand("בוצע 2"), {
      type: "complete",
      index: 2,
    });
    assert.equal(parseWhatsAppCommand("דחה שעתיים")?.type, "snooze");
    assert.equal(parseWhatsAppCommand("מחר")?.type, "tomorrow");
    assert.equal(parseWhatsAppCommand("done:abc-1")?.itemId, "abc-1");
  });

  it("resolves numbered item from last capture", () => {
    assert.equal(
      resolveCommandItemId({ type: "complete", index: 2 }, ["a", "b", "c"]),
      "b",
    );
  });

  it("builds a numbered capture confirmation", () => {
    const text = buildCaptureConfirmation([{ title: "חלב" }, { title: "לחם" }]);
    assert.match(text, /נפתחו 2 פריטים/);
    assert.match(text, /1\. חלב/);
    assert.match(text, /בוצע 1/);
  });
});

describe("WhatsApp structured menu and queries", () => {
  const tags = ["עבודה", "לימודים", "בית"];

  it("detects menu request", () => {
    assert.equal(isWhatsAppMenuRequest("תפריט"), true);
    assert.equal(isWhatsAppMenuRequest("מה אפשר"), true);
    assert.equal(isWhatsAppMenuRequest("מה אפשר לשאול"), true);
    assert.equal(isWhatsAppMenuRequest("שאלות מובנות"), true);
    assert.equal(isWhatsAppMenuRequest("עזרה"), true);
    assert.equal(isWhatsAppMenuRequest("לקנות חלב"), false);
  });

  it("lists canned questions including work/studies tags", () => {
    const menu = builtInMenuQuestions(tags);
    assert.ok(menu.some((row) => row.label === "מה יש לי היום"));
    assert.ok(menu.some((row) => row.label === "עבודה מחר"));
    assert.ok(menu.some((row) => row.label === "לימודים היום"));
    assert.ok(menu.some((row) => row.label === "תכנן לי את היום"));
    assert.match(buildWhatsAppMenuText(menu), /1\. מה יש לי היום/);
  });

  it("maps a number or label to the canned query", () => {
    const menu = builtInMenuQuestions(tags);
    assert.deepEqual(parseMenuSelection("1", menu), {
      type: "query",
      day: "today",
      tag: null,
    });
    assert.deepEqual(parseMenuSelection("2", menu), {
      type: "query",
      day: "tomorrow",
      tag: null,
    });
    assert.deepEqual(parseMenuSelection("עבודה היום", menu), {
      type: "query",
      day: "today",
      tag: "עבודה",
    });
    assert.deepEqual(parseMenuSelection("query:tomorrow:לימודים", menu), {
      type: "query",
      day: "tomorrow",
      tag: "לימודים",
    });
  });

  it("parses free-text board questions", () => {
    assert.deepEqual(parseWhatsAppQuery("מה המשימות שלי היום", tags), {
      type: "query",
      day: "today",
      tag: null,
    });
    assert.deepEqual(parseWhatsAppQuery("מה המשימות מחר בעבודה", tags), {
      type: "query",
      day: "tomorrow",
      tag: "עבודה",
    });
    assert.deepEqual(parseWhatsAppQuery("תכנן לי את היום", tags), {
      type: "query",
      day: "plan",
      tag: null,
    });
    assert.deepEqual(parseWhatsAppQuery("מה המשימות שהתאריך שלהם עבר", tags), {
      type: "query",
      day: "overdue",
      tag: null,
    });
    assert.deepEqual(
      parseWhatsAppQuery("שלח לי את המשימות שלי שהתאריך שלהן עבר", tags),
      { type: "query", day: "overdue", tag: null },
    );
    assert.deepEqual(parseWhatsAppQuery("משימות באיחור", tags), {
      type: "query",
      day: "overdue",
      tag: null,
    });
    assert.equal(parseWhatsAppQuery("לקנות חלב מחר", tags), null);
  });

  it("filters tasks by calendar day and tag", () => {
    const now = new Date("2026-09-17T12:00:00+03:00");
    const today = {
      title: "שיחה",
      due_date: "2026-09-17T10:00:00+03:00",
      tags: ["עבודה"],
      status: "pending",
    };
    const tomorrow = {
      title: "מבחן",
      due_date: "2026-09-18T09:00:00+03:00",
      tags: ["לימודים"],
      status: "pending",
    };
    const overdue = {
      title: "חשבון",
      due_date: "2026-09-15T09:00:00+03:00",
      tags: ["בית"],
      status: "pending",
    };
    assert.equal(itemMatchesBriefingDay(today, "today", now), true);
    assert.equal(itemMatchesBriefingDay(tomorrow, "today", now), false);
    assert.equal(itemMatchesBriefingDay(tomorrow, "tomorrow", now), true);
    assert.equal(itemMatchesBriefingDay(overdue, "overdue", now), true);
    assert.equal(itemMatchesBriefingDay(today, "overdue", now), false);
    assert.equal(itemMatchesQueryTag(today, "עבודה"), true);
    assert.equal(itemMatchesQueryTag(today, "לימודים"), false);

    const recurringStale = {
      title: "סנאט מילואים",
      due_date: "2026-09-10T09:00:00+03:00",
      tags: ["צבא"],
      status: "pending",
      metadata: { reminder_recurrence: "weekly" },
    };
    assert.equal(itemMatchesBriefingDay(recurringStale, "overdue", now), false);
    assert.equal(itemMatchesBriefingDay(recurringStale, "today", now), true);
  });

  it("formats a single concentrated briefing", () => {
    const text = buildTaskBriefing(
      [
        {
          title: "שיחת לקוח",
          due_date: "2026-09-17T10:30:00+03:00",
          tags: ["עבודה"],
        },
      ],
      { type: "query", day: "today", tag: "עבודה" },
    );
    assert.match(text, /1 משימה היום ב«עבודה»/);
    assert.match(text, /שיחת לקוח \(10:30\)/);
    assert.match(text, /תפריט/);
  });
});
