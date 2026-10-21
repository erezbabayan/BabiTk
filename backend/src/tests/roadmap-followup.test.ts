import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { featureFlags } from "../lib/feature-flags.js";
import {
  buildWeeklySummaryMessage,
  envFlagEnabled,
  isWeeklySummaryDue,
  proactiveDispatcherMode,
} from "../lib/proactive-whatsapp.js";
import { isInsideShabbatQuiet, resolveJewishPhrase } from "../lib/jewish-calendar.js";
import {
  applyHabitDefaults,
  emptyHabitMemory,
  learnCategory,
  learnMorningHour,
  learnShoppingWeekday,
  preferredKey,
} from "../lib/habit-memory.js";
import { applyForwardedCapture, isGratitudeOnly } from "../lib/forwarded-task.js";
import { confirmedStepCards, parseBreakdownAnswer, proposeBreakdown } from "../lib/task-breakdown.js";
import { decideCalendarMerge } from "../lib/calendar-merge.js";
import { describeCalendarSyncReadiness } from "../lib/google-calendar-sync-plan.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function jerusalemHour(iso: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return Number(hour === "24" ? "0" : hour);
}

function jerusalemKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

describe("feature defaults", () => {
  it("treats an empty flag as on and an explicit false as off", () => {
    assert.equal(envFlagEnabled(undefined, true), true);
    assert.equal(envFlagEnabled("false", true), false);
    assert.equal(envFlagEnabled("0", true), false);
    assert.equal(proactiveDispatcherMode(undefined), "edge");
    assert.equal(proactiveDispatcherMode("true"), "edge");
    assert.equal(proactiveDispatcherMode("convex"), "convex");
    assert.equal(proactiveDispatcherMode("off"), "off");
  });

  it("keeps the WhatsApp switches on unless the environment turns them off", () => {
    const keys = [
      "WHATSAPP_MORNING_BRIEFING",
      "WHATSAPP_FOLLOWUP",
      "WHATSAPP_MULTI_CARD",
      "WHATSAPP_UNDO",
      "WHATSAPP_NL_COMMANDS",
      "WHATSAPP_AUTO_CATEGORY",
      "WHATSAPP_SEMANTIC_SEARCH",
    ] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      assert.equal(featureFlags.morningBriefing, true);
      assert.equal(featureFlags.followUp, true);
      assert.equal(featureFlags.multiCard, true);
      assert.equal(featureFlags.nlCommands, true);
      assert.equal(featureFlags.semanticSearch, true);
      process.env.WHATSAPP_MORNING_BRIEFING = "false";
      assert.equal(featureFlags.morningBriefing, false);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("jewish phrases and shabbat", () => {
  const january = new Date("2026-01-15T10:00:00.000Z");

  it("maps erev pesach, after sukkot, before shabbat, and after the holiday", () => {
    const erev = resolveJewishPhrase("תזכיר לי בערב פסח לקנות יין", january);
    assert.ok(erev);
    assert.equal(jerusalemKey(erev!), "2026-04-01");
    const afterSukkot = resolveJewishPhrase("אחרי סוכות לסדר את הסוכה", january);
    assert.equal(jerusalemKey(afterSukkot!), "2026-10-04");
    const before = resolveJewishPhrase("לפני שבת לבשל", january);
    assert.equal(jerusalemKey(before!), "2026-01-16");
    assert.equal(jerusalemHour(before!), 12);
    const afterHoliday = resolveJewishPhrase("אחרי החג לחזור לשגרה", january);
    assert.equal(jerusalemKey(afterHoliday!), "2026-04-09");
    const motzash = resolveJewishPhrase("במוצ״ש להתקשר", january);
    assert.equal(jerusalemKey(motzash!), "2026-01-17");
    assert.equal(resolveJewishPhrase("לקנות חלב מחר", january), null);
  });

  it("is quiet only from Friday candles to Saturday havdalah", () => {
    assert.equal(isInsideShabbatQuiet(new Date("2026-10-21T12:00:00.000Z")), false);
    assert.equal(isInsideShabbatQuiet(new Date("2026-10-23T14:00:00.000Z")), false);
    assert.equal(isInsideShabbatQuiet(new Date("2026-10-23T14:30:00.000Z")), true);
    assert.equal(isInsideShabbatQuiet(new Date("2026-10-24T15:00:00.000Z")), true);
    assert.equal(isInsideShabbatQuiet(new Date("2026-10-24T16:00:00.000Z")), false);
  });
});

describe("habits, forwards, and breakdown", () => {
  it("uses a morning hour and a shopping day only after two samples", () => {
    let memory = emptyHabitMemory();
    memory = learnMorningHour(memory, 8);
    assert.equal(preferredKey(memory.morningHours), null);
    memory = learnMorningHour(memory, 8);
    memory = learnShoppingWeekday(memory, 0);
    memory = learnShoppingWeekday(memory, 0);
    memory = learnCategory(memory, "קניות");
    memory = learnCategory(memory, "קניות");
    const morning = applyHabitDefaults(
      "בבוקר להתקשר לדני",
      [{ due_date: "2026-10-21T06:00:00.000Z", tags: [] as string[] }],
      memory,
      new Date("2026-10-20T08:00:00.000Z"),
    );
    assert.equal(jerusalemHour(morning[0]!.due_date!), 8);
    const shopping = applyHabitDefaults(
      "לקנות חלב",
      [{ due_date: null, tags: [] as string[] }],
      memory,
      new Date("2026-10-21T08:00:00.000Z"),
    );
    assert.equal(jerusalemKey(shopping[0]!.due_date!), "2026-10-25");
    assert.deepEqual(shopping[0]!.tags, ["קניות"]);
  });

  it("turns a forwarded note into a task and ignores thanks", () => {
    assert.equal(isGratitudeOnly("תודה רבה"), true);
    assert.equal(isGratitudeOnly("תודה רבה, תתקשר מחר"), false);
    const rows = applyForwardedCapture("הועברה\nלשלם ארנונה מחר", [
      { title: "", content: "לשלם ארנונה מחר", is_actionable: false },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.is_actionable, true);
    assert.equal(applyForwardedCapture("תודה רבה", []).length, 0);
  });

  it("proposes dated steps and saves them only as confirmed cards", () => {
    const pending = proposeBreakdown("לארגן יום הולדת ביום שישי", new Date("2026-10-20T08:00:00.000Z"));
    assert.ok(pending);
    assert.equal(pending!.steps.length >= 3, true);
    assert.equal(parseBreakdownAnswer("כן"), "yes");
    assert.equal(confirmedStepCards(pending!).length, pending!.steps.length);
    assert.equal(proposeBreakdown("לקנות חלב"), null);
    assert.equal(parseBreakdownAnswer("כן תוסיף גם עוגה"), null);
  });
});

describe("weekly summary and calendar merge", () => {
  it("is due on Friday at 13:00 and stays one line when nothing moved", () => {
    assert.equal(isWeeklySummaryDue(new Date("2026-10-23T10:00:00.000Z")), true);
    assert.equal(isWeeklySummaryDue(new Date("2026-10-23T09:00:00.000Z")), false);
    assert.equal(isWeeklySummaryDue(new Date("2026-10-22T10:00:00.000Z")), false);
    assert.match(buildWeeklySummaryMessage({ completed: [], stuck: [] }), /לא הייתה תנועה/);
    assert.match(buildWeeklySummaryMessage({ completed: ["ארנונה"], stuck: ["רופא"] }), /ארנונה/);
  });

  it("does not overwrite a newer local due date", () => {
    assert.equal(
      decideCalendarMerge({
        localDue: "2026-10-21T06:00:00.000Z",
        localUpdatedAt: "2026-10-20T12:00:00.000Z",
        remoteStart: "2026-10-22T06:00:00.000Z",
        remoteUpdatedAt: "2026-10-20T08:00:00.000Z",
      }),
      "keep-local",
    );
    assert.equal(
      decideCalendarMerge({
        localDue: "2026-10-21T06:00:00.000Z",
        localUpdatedAt: "2026-10-20T08:00:00.000Z",
        remoteStart: "2026-10-22T06:00:00.000Z",
        remoteUpdatedAt: "2026-10-20T12:00:00.000Z",
      }),
      "apply-remote",
    );
    const off = describeCalendarSyncReadiness({
      clientId: "abc.apps.googleusercontent.com",
      clientSecret: "secret-value-ok",
      bidirectionalRequested: false,
    });
    assert.equal(off.bidirectional, false);
    const on = describeCalendarSyncReadiness({
      clientId: "abc.apps.googleusercontent.com",
      clientSecret: "secret-value-ok",
      bidirectionalRequested: true,
    });
    assert.equal(on.bidirectional, true);
    assert.equal(on.mode, "bidirectional");
  });
});

describe("shared copies", () => {
  it("keeps the jewish calendar file identical in Edge and Convex", () => {
    const source = readFileSync(path.resolve(here, "../lib/jewish-calendar.ts"), "utf8");
    const edge = readFileSync(path.resolve(here, "../../../supabase/functions/_shared/jewish-calendar.ts"), "utf8");
    const convex = readFileSync(path.resolve(here, "../../../convex/lib/jewish_calendar.ts"), "utf8");
    assert.equal(edge, source);
    assert.equal(convex, source);
  });
});
