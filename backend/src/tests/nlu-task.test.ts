import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskCreatedConfirmation,
  integrateNluTaskPayload,
  resolveReminderDatetime,
} from "../services/nlu-task.service.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2026-06-18T12:00:00+03:00");

describe("integrateNluTaskPayload", () => {
  it("accepts valid NLU JSON", () => {
    const result = integrateNluTaskPayload({
      task: "לדבר עם משה מהעירייה",
      context: ["עירייה", "תקציב גינה"],
      reminder_datetime: "2026-06-19T10:00:00+03:00",
      original_transcription: "צריך לדבר עם משה מהעירייה מחר ב-10",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.task, "לדבר עם משה מהעירייה");
      assert.deepEqual(result.payload.context, ["עירייה", "תקציב גינה"]);
    }
  });

  it("rejects missing task", () => {
    const result = integrateNluTaskPayload({
      task: "",
      context: [],
      original_transcription: "test",
    });
    assert.equal(result.ok, false);
  });
});

describe("resolveReminderDatetime", () => {
  it("parses explicit ISO datetime", () => {
    const due = resolveReminderDatetime("2026-06-19T10:00:00+03:00", {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.equal(due, "2026-06-19T07:00:00.000Z");
  });

  it("defaults to +24h when reminder is omitted", () => {
    const due = resolveReminderDatetime(undefined, {
      timezone: TZ,
      referenceDate: REF,
    });
    assert.ok(due);
    const parsed = new Date(due);
    const diffHours = (parsed.getTime() - REF.getTime()) / 3_600_000;
    assert.ok(diffHours >= 23 && diffHours <= 25);
  });

  it("throws on invalid date", () => {
    assert.throws(
      () => resolveReminderDatetime("not-a-date", { timezone: TZ, referenceDate: REF }),
      /Invalid reminder_datetime/,
    );
  });
});

describe("buildTaskCreatedConfirmation", () => {
  it("formats Hebrew confirmation for tomorrow", () => {
    const msg = buildTaskCreatedConfirmation(
      "לדבר עם משה",
      "2026-06-19T10:00:00+03:00",
      { timezone: TZ, referenceDate: REF },
    );
    assert.match(msg, /המשימה 'לדבר עם משה' נוצרה בהצלחה/);
    assert.match(msg, /מחר ב-10:00/);
  });
});
