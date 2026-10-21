import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  appendProactiveSlot,
  buildFollowUpMessage,
  buildMorningBriefingMessage,
  buildSearchReply,
  countProactiveSlots,
  enrichWhatsAppCapture,
  followUpQuickReplies,
  isProactiveDue,
  nextWeekdayIso,
  parseMoveCommand,
  parseNoteSearch,
  parseRecurrencePhrase,
  partitionOpenTasks,
  pickFocusTasks,
  popUndo,
  proactiveSlotKey,
  pushUndo,
  rankByOverlap,
  readUndoState,
  splitCaptureCards,
  suggestCategory,
  type CaptureRow,
  type ProactiveTask,
} from "../lib/proactive-whatsapp.js";
import { parseWhatsAppCommand } from "../lib/whatsapp-commands.js";
import { describeCalendarSyncReadiness } from "../lib/google-calendar-sync-plan.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const sample = (id: string, title: string, dueAt: string | null): ProactiveTask => ({
  id,
  title,
  dueAt,
});

describe("morning briefing", () => {
  const now = new Date("2026-10-20T04:30:00.000Z"); // 07:30 Asia/Jerusalem

  it("is due at 07:30 Jerusalem and not at 07:00", () => {
    assert.equal(isProactiveDue(now, 7, 30), true);
    assert.equal(isProactiveDue(new Date("2026-10-20T04:00:00.000Z"), 7, 30), false);
    assert.equal(isProactiveDue(now, 8, 0), false);
  });

  it("separates today from overdue and suggests three", () => {
    const groups = partitionOpenTasks(
      [
        sample("a", "ארנונה", "2026-10-19T06:00:00.000Z"),
        sample("b", "רופא", "2026-10-20T07:00:00.000Z"),
        sample("c", "חלב", "2026-10-20T15:00:00.000Z"),
        sample("d", "בלי תאריך", null),
        sample("e", "מחר", "2026-10-21T06:00:00.000Z"),
      ],
      now,
    );
    assert.deepEqual(groups.overdue.map((task) => task.id), ["a"]);
    assert.deepEqual(groups.today.map((task) => task.id), ["b", "c"]);
    assert.deepEqual(pickFocusTasks(groups).map((task) => task.id), ["a", "b", "c"]);
    const message = buildMorningBriefingMessage(groups, "2026-10-20");
    assert.match(message, /בוקר טוב מ-BabiTk/);
    assert.match(message, /באיחור/);
    assert.match(message, /ארנונה/);
    assert.match(message, /שלוש להתמקד/);
    assert.match(message, /בוצע 1/);
  });

  it("dedupes a slot and caps the day at the stored keys", () => {
    const key = proactiveSlotKey("briefing", "2026-10-20", 7);
    const slots = appendProactiveSlot([], key, "2026-10-20");
    assert.deepEqual(appendProactiveSlot(slots, key, "2026-10-20"), slots);
    assert.equal(countProactiveSlots(slots, "2026-10-20"), 1);
    assert.equal(countProactiveSlots(["2026-10-19:briefing:7"], "2026-10-20"), 0);
  });
});

describe("follow-up", () => {
  it("asks to snooze or finish with quick replies", () => {
    const message = buildFollowUpMessage([sample("1", "להתקשר לרופא", "2026-10-20T08:00:00.000Z")]);
    assert.match(message, /להתקשר לרופא/);
    assert.match(message, /לדחות למחר בבוקר/);
    const replies = followUpQuickReplies("abc-123");
    assert.deepEqual(
      replies.map((reply) => reply.id),
      ["done:abc-123", "snooze1h:abc-123", "tomorrow:abc-123"],
    );
    assert.equal(parseWhatsAppCommand("עוד שעה")?.type, "snooze");
    assert.equal(parseWhatsAppCommand("עוד שעה 2")?.type, "snooze");
    assert.equal(parseWhatsAppCommand("snooze1h:abc-123")?.type, "snooze");
    assert.equal(parseWhatsAppCommand("בטל")?.type, "undo");
  });
});

describe("capture cards and recurrence", () => {
  it("turns a shopping line into one card with a checklist", () => {
    const cards = splitCaptureCards("לקנות: חלב, לחם, ביצים");
    assert.equal(cards?.length, 1);
    assert.equal(cards?.[0]?.title, "לקנות");
    assert.deepEqual(cards?.[0]?.checklist?.map((line) => line.text), ["חלב", "לחם", "ביצים"]);
  });

  it("splits a voice-style conjunction into several cards", () => {
    const cards = splitCaptureCards("לקנות חלב וגם להתקשר לדני וגם לשלם ארנונה");
    assert.equal(cards?.length, 3);
    assert.match(cards?.[2]?.title ?? "", /ארנונה/);
  });

  it("leaves a single reminder sentence alone", () => {
    assert.equal(splitCaptureCards("מחר ב-10 להתקשר למוסך"), null);
  });

  it("reads monthly, weekday, and daily phrases", () => {
    assert.equal(parseRecurrencePhrase("כל 1 לחודש לשלם ארנונה"), "monthly");
    assert.equal(parseRecurrencePhrase("כל יום ראשון לקחת את הילד"), "weekly");
    assert.equal(parseRecurrencePhrase("כל יום ב-8 לקחת ויטמין"), "daily");
    assert.equal(parseRecurrencePhrase("ימי חול לעמוד בפקק"), "weekdays");
  });

  it("applies cards and recurrence only when asked", () => {
    const rows: CaptureRow[] = [
      {
        title: "הכל",
        content: "לקנות חלב וגם להתקשר לדני",
        is_actionable: true,
        tags: [],
        due_date: null,
      },
    ];
    const split = enrichWhatsAppCapture("לקנות חלב וגם להתקשר לדני", rows, {
      multiCard: true,
      recurrence: true,
      autoCategory: false,
    });
    assert.equal(split.length, 2);
    const recurring = enrichWhatsAppCapture("כל 1 לחודש לשלם ארנונה", rows, {
      multiCard: false,
      recurrence: true,
      autoCategory: true,
      allowedTags: ["פיננסי"],
    });
    assert.equal(recurring[0]?.reminder_recurrence, "monthly");
    assert.ok(recurring[0]?.tags.includes("פיננסי"));
    assert.equal(suggestCategory("תור לרופא", ["בריאות"])?.priority, "high");
  });
});

describe("natural language and search", () => {
  it("moves a named task to the next Monday morning", () => {
    const command = parseMoveCommand("תזיז את הרופא ליום שני");
    assert.equal(command?.title, "הרופא");
    assert.equal(command?.weekday, 1);
    assert.equal(parseMoveCommand("תזיז ליום שני")?.title, null);
    const iso = nextWeekdayIso(new Date("2026-10-20T10:00:00.000Z"), 1, 9, 0);
    assert.match(iso, /^2026-10-26T09:00:00/);
  });

  it("ranks a note about a renovation above unrelated cards", () => {
    assert.equal(parseNoteSearch("מה רשמתי על השיפוץ"), "השיפוץ");
    const ranked = rankByOverlap("השיפוץ", [
      { id: "1", title: "קניות", content: "חלב" },
      { id: "2", title: "הצעת מחיר לשיפוץ המטבח", content: "ריצוף" },
    ]);
    assert.equal(ranked[0]?.id, "2");
    assert.match(buildSearchReply("השיפוץ", ranked), /הצעת מחיר/);
  });
});

describe("undo stack", () => {
  it("pushes and pops the latest capture", () => {
    const state = pushUndo(readUndoState(null), {
      id: "u1",
      at: "2026-10-20T08:00:00.000Z",
      kind: "capture",
      items: [
        { id: "i1", title: "חלב", status: "inbox", due_date: null, deleted_at: null },
      ],
    });
    const popped = popUndo(state);
    assert.equal(popped.entry?.kind, "capture");
    assert.equal(popped.state.stack.length, 0);
  });
});

describe("copies stay in sync", () => {
  it("matches the Edge and Convex copies", () => {
    const source = readFileSync(path.resolve(here, "../lib/proactive-whatsapp.ts"), "utf8");
    const edge = readFileSync(
      path.resolve(here, "../../../supabase/functions/_shared/proactive-whatsapp.ts"),
      "utf8",
    );
    const convex = readFileSync(path.resolve(here, "../../../convex/lib/proactive_whatsapp.ts"), "utf8");
    assert.equal(edge, source);
    assert.equal(convex, source);
  });
});

describe("calendar sync scaffold", () => {
  it("does not claim bidirectional sync without real credentials", () => {
    const empty = describeCalendarSyncReadiness({ clientId: "", clientSecret: "" });
    assert.equal(empty.bidirectional, false);
    assert.equal(empty.credentialsPresent, false);
    const ready = describeCalendarSyncReadiness({
      clientId: "abc.apps.googleusercontent.com",
      clientSecret: "secret-value-ok",
    });
    assert.equal(ready.credentialsPresent, true);
    assert.equal(ready.bidirectional, false);
  });
});
