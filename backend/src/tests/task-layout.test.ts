import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseInboundText, buildSupabaseIngestRows } from "../../../convex/lib/ingest/supabaseIngestRows.js";
import {
  extractPlaceRows,
  extractReminderRecurrence,
  stripCaptureLead,
} from "../../../convex/lib/ingest/taskLayout.js";
import { parseInputLocally } from "../services/local-parse.service.js";
import { classifyWhatsAppInbound } from "../lib/whatsapp-inbound-route.js";

const TZ = "Asia/Jerusalem";
const WEDNESDAY_NOON = new Date("2025-06-18T12:00:00+03:00");
const MONDAY_NOON = new Date("2025-06-16T12:00:00+03:00");

const MUNICIPALITY_STATUS =
  "משימה קבועה בימי רביעי בעשר בבוקר, סטטוס נהלים חדשים ושיווק ברשויות בית אריה, עמנואל ושלמה ציון, באזור התעשייה, ואריאל גם כן";

describe("task layout layers", () => {
  it("strips capture verbs so they never become the title", () => {
    assert.equal(stripCaptureLead("תכניס משימה, לקנות חלב מחר"), "לקנות חלב מחר");
    assert.equal(stripCaptureLead("תוסיף הערה, הקוד 123"), "הערה, הקוד 123");
  });

  it("detects weekly recurrence from בימי / קבועה and not from שבוע הבא", () => {
    assert.equal(extractReminderRecurrence(MUNICIPALITY_STATUS), "weekly");
    assert.equal(extractReminderRecurrence("יום רביעי שבוע הבא שיווק שלום ציון"), null);
    assert.equal(extractReminderRecurrence("כל יום לקחת כדור"), "daily");
  });

  it("opens municipality rows from ברשויות and attaches industrial zone", () => {
    const rows = extractPlaceRows(MUNICIPALITY_STATUS);
    assert.deepEqual(rows, [
      "בית אריה",
      "עמנואל",
      "שלום ציון — אזור תעשייה",
      "אריאל",
    ]);
  });

  it("parses the Wednesday 10:00 municipality template into four layers", () => {
    const items = parseInboundText(MUNICIPALITY_STATUS, {
      sourceType: "whatsapp_text",
      timezone: TZ,
      referenceDate: WEDNESDAY_NOON,
    });
    assert.equal(items.length, 1);
    const item = items[0]!;
    assert.equal(item.is_actionable, true);
    assert.equal(item.reminder_recurrence, "weekly");
    assert.match(item.due_date ?? "", /2025-06-25T10:00:00/);
    assert.equal(item.title, "סטטוס נהלים ושיווק");
    assert.equal(item.content, "");
    assert.deepEqual(
      item.checklist?.map((row) => row.text),
      ["בית אריה", "עמנואל", "שלום ציון — אזור תעשייה", "אריאל"],
    );
    assert.equal(item.analysis && "notify_at" in item.analysis, true);
  });

  it("persists recurrence and checklist on ingest rows, not in the body", () => {
    const rows = buildSupabaseIngestRows("user-1", MUNICIPALITY_STATUS, {
      timezone: TZ,
      nowMs: WEDNESDAY_NOON.getTime(),
      referenceDate: WEDNESDAY_NOON,
      sourceType: "whatsapp_text",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, "סטטוס נהלים ושיווק");
    assert.equal(rows[0]?.content, "");
    assert.equal(rows[0]?.metadata.reminder_recurrence, "weekly");
    assert.equal(rows[0]?.metadata.reminder_manual, true);
    const checklist = rows[0]?.metadata.checklist as Array<{ text: string }>;
    assert.equal(checklist.length, 4);
  });

  it("keeps a simple tomorrow task as title + due date without rows", () => {
    const items = parseInboundText("לקנות חלב מחר", {
      sourceType: "whatsapp_text",
      timezone: TZ,
      referenceDate: WEDNESDAY_NOON,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, "לקנות חלב");
    assert.equal(items[0]?.content, "");
    assert.equal(items[0]?.reminder_recurrence ?? null, null);
    assert.equal(items[0]?.checklist, undefined);
    assert.match(items[0]?.due_date ?? "", /2025-06-19T09:00:00/);
  });

  it("treats «יום רביעי שבוע הבא» as next-week one-shot, not weekly rows", () => {
    const items = parseInboundText(
      "תכניס משימה, יום רביעי שבוע הבא, שיווקים שלום ציון בעבודה",
      {
        sourceType: "whatsapp_voice",
        timezone: TZ,
        referenceDate: MONDAY_NOON,
      },
    );
    assert.equal(items.length, 1);
    const item = items[0]!;
    assert.equal(item.is_actionable, true);
    assert.equal(item.reminder_recurrence ?? null, null);
    assert.equal(item.checklist, undefined);
    assert.match(item.due_date ?? "", /2025-06-25T09:00:00/);
    assert.match(item.title, /שיווק/);
    assert.ok(!/תכניס|משימה קבועה|יום רביעי/.test(item.title));
  });

  it("keeps notes as notes with no schedule or rows", () => {
    const items = parseInboundText("הערה: הקוד של המחסן 9845", {
      sourceType: "whatsapp_text",
      timezone: TZ,
      referenceDate: WEDNESDAY_NOON,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.is_actionable, false);
    assert.equal(items[0]?.due_date, null);
    assert.equal(items[0]?.reminder_recurrence ?? null, null);
    assert.equal(items[0]?.checklist, undefined);
  });

  it("still splits unrelated tasks on וגם", () => {
    const parsed = parseInputLocally({
      text: "לקנות חלב מחר וגם להתקשר לאמא",
      timezone: TZ,
      referenceDate: WEDNESDAY_NOON,
    });
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0]?.title, "לקנות חלב");
    assert.equal(parsed.items[1]?.title, "להתקשר לאמא");
    assert.equal(parsed.items[0]?.checklist, undefined);
    assert.equal(parsed.items[1]?.checklist, undefined);
  });

  it("does not steal בבי questions into the capture layout", () => {
    const question = "בבי, מה המשימות לשבוע הבא?";
    assert.equal(classifyWhatsAppInbound(question).lane, "question");
    const capture = MUNICIPALITY_STATUS;
    assert.equal(classifyWhatsAppInbound(capture).lane, "capture");
    assert.equal(
      classifyWhatsAppInbound("תכניס משימה יום רביעי שבוע הבא שיווקים").lane,
      "capture",
    );
  });

  it("keeps unique long captures in content when there are no place-rows", () => {
    const parsed = parseInputLocally({
      text: "להכין כובעים לנופש באוגוסט ביחד עם אביה, צריך לשבת על זה ב-1.7",
      timezone: TZ,
      referenceDate: new Date("2026-06-24T12:00:00+03:00"),
    });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.title, "להכין כובעים לנופש");
    assert.match(parsed.items[0]?.content ?? "", /כובעים לנופש/);
    assert.equal(parsed.items[0]?.checklist, undefined);
  });
});
