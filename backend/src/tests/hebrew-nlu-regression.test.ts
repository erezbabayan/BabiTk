import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInputLocally } from "../services/local-parse.service.js";
import { resolveDueDateFromText } from "../services/hebrew-date-resolver.service.js";
import { resolveIngestItemStatus } from "../services/entity-rules.service.js";
import { extractTimeOfDay } from "../utils/hebrew-time-words.js";

const TZ = "Asia/Jerusalem";
/** Wednesday — baseline for "next Sunday" tests */
const REF = new Date("2026-06-17T12:00:00+03:00");

function parseOne(text: string) {
  const parsed = parseInputLocally({ text, timezone: TZ, referenceDate: REF });
  assert.equal(parsed.items.length, 1, `expected single item for: ${text}`);
  return parsed.items[0]!;
}

describe("extractTimeOfDay — spoken Hebrew hours", () => {
  it("parses בעשר בבוקר as 10:00", () => {
    const time = extractTimeOfDay("ביום ראשון בעשר בבוקר");
    assert.ok(time);
    assert.equal(time.hour, 10);
    assert.equal(time.minute, 0);
  });

  it("parses בשלוש בערב as 15:00", () => {
    const time = extractTimeOfDay("פגישה בשלוש בערב");
    assert.ok(time);
    assert.equal(time.hour, 15);
  });

  it("parses digit time with half hour", () => {
    const time = extractTimeOfDay("מחר ב-10 וחצי");
    assert.ok(time);
    assert.equal(time.hour, 10);
    assert.equal(time.minute, 30);
  });
});

describe("resolveDueDateFromText — weekday + spoken time", () => {
  it("resolves next Sunday at 10:00 from בעשר בבוקר", () => {
    const due = resolveDueDateFromText("שיחה עם המחט ביום ראשון בעשר בבוקר", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.match(due!, /2026-06-21T10:00:00\+03:00/);
  });

  it("resolves Tuesday evening meeting", () => {
    const due = resolveDueDateFromText("פגישה עם דני ביום שלישי בשלוש בערב", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.match(due!, /2026-06-23T15:00:00\+03:00/);
  });
});

describe("parseInputLocally — end-to-end Hebrew NLU regression", () => {
  it("needle conversation → task, Sunday 10:00, clean title", () => {
    const item = parseOne("שיחה עם המחט ביום ראשון בעשר בבוקר");

    assert.equal(item.is_actionable, true);
    assert.match(item.due_date!, /2026-06-21T10:00:00\+03:00/);
    assert.equal(item.title, "שיחה עם המחט");
    assert.equal(item.content, "");
    assert.equal(resolveIngestItemStatus(item), "inbox");
  });

  it("benny brada conversation → Sunday 09:00 with בתשע בבוקר", () => {
    const item = parseOne("שיחה עם בני ברדה ביום ראשון בתשע בבוקר");

    assert.equal(item.is_actionable, true);
    assert.match(item.due_date!, /2026-06-21T09:00:00\+03:00/);
    assert.equal(item.title, "שיחה עם בני ברדה");
    assert.equal(resolveIngestItemStatus(item), "inbox");
  });

  it("tomorrow spoken hour → task with due date, stays in inbox", () => {
    const item = parseOne("מחר בעשר בבוקר לקנות חלב");

    assert.equal(item.is_actionable, true);
    assert.match(item.due_date!, /2026-06-18T10:00:00\+03:00/);
    assert.equal(item.title, "לקנות חלב");
  });

  it("Sunday morning without explicit hour defaults to 09:00", () => {
    const item = parseOne("יום ראשון בבוקר לטפל בדואר");

    assert.equal(item.is_actionable, true);
    assert.match(item.due_date!, /2026-06-21T09:00:00\+03:00/);
    assert.equal(item.title, "לטפל בדואר");
  });

  it("plain code snippet stays a note in inbox", () => {
    const item = parseOne("קוד המחסן 9845");

    assert.equal(item.is_actionable, false);
    assert.equal(item.due_date, null);
    assert.match(item.title, /קוד המחסן/);
    assert.equal(resolveIngestItemStatus(item), "inbox");
  });

  it("infinitive without time is still a task", () => {
    const item = parseOne("להתקשר לאמא");

    assert.equal(item.is_actionable, true);
    assert.equal(item.due_date, null);
    assert.equal(item.title, "להתקשר לאמא");
    assert.equal(resolveIngestItemStatus(item), "inbox");
  });

  it("splits task + note in one capture", () => {
    const parsed = parseInputLocally({
      text: "שיחה עם המחט ביום ראשון בעשר בבוקר; קוד המחסן 4421",
      timezone: TZ,
      referenceDate: REF,
    });

    assert.equal(parsed.items.length, 2);
    const task = parsed.items.find((row) => row.is_actionable);
    const note = parsed.items.find((row) => !row.is_actionable);
    assert.ok(task);
    assert.ok(note);
    assert.match(task!.due_date!, /2026-06-21T10:00:00\+03:00/);
    assert.equal(task!.title, "שיחה עם המחט");
    assert.equal(note!.due_date, null);
  });
});
