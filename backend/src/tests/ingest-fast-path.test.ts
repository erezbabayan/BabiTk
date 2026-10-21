import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";

import { resolveDueDateFromText } from "../services/hebrew-date-resolver.service.js";
import { parseInputLocally } from "../services/local-parse.service.js";
import { shouldUseLocalParseFastPath } from "../services/parse-input.service.js";

const TZ = "Asia/Jerusalem";
const REF = new Date("2025-06-18T12:00:00+03:00");

const PHRASES = [
  "לקנות חלב",
  "מחר ב-10 להתקשר למוסך",
  "היום בערב לקנות חלב",
  "לקנות חלב היום",
  "לקנות חלב ב-8",
  "להתקשר בעוד שעה",
  "פגישה ביום רביעי",
  "משימה לשבוע הבא",
  "לשלם 20/06/2025",
];

describe("local parse fast path", () => {
  it("keeps a single Hebrew task on the deterministic parser", () => {
    assert.equal(shouldUseLocalParseFastPath("מחר ב-10 להתקשר למוסך"), true);
    assert.equal(shouldUseLocalParseFastPath("לקנות חלב וגם לשלוח מייל"), true);
  });

  it("leaves long notes and questions for the model", () => {
    assert.equal(shouldUseLocalParseFastPath("מה יש לי היום?"), false);
    assert.equal(shouldUseLocalParseFastPath(`שורה\nשורה\nשורה\nשורה`), false);
    assert.equal(shouldUseLocalParseFastPath("א".repeat(401)), false);
  });

  it("fills due dates for the common Hebrew phrases", () => {
    const today = parseInputLocally({
      text: "לקנות חלב היום",
      timezone: TZ,
      referenceDate: REF,
      allowedTags: ["בית"],
    });
    assert.equal(today.items[0]?.title, "לקנות חלב");
    assert.match(today.items[0]?.due_date ?? "", /2025-06-18T09:00:00\+03:00/);

    const clock = parseInputLocally({
      text: "לקנות חלב ב-8",
      timezone: TZ,
      referenceDate: REF,
      allowedTags: ["בית"],
    });
    assert.equal(clock.items[0]?.title, "לקנות חלב");
    assert.match(clock.items[0]?.due_date ?? "", /2025-06-19T08:00:00\+03:00/);

    const hour = parseInputLocally({
      text: "להתקשר בעוד שעה",
      timezone: TZ,
      referenceDate: REF,
    });
    assert.match(hour.items[0]?.due_date ?? "", /2025-06-18T13:00:00\+03:00/);
  });
});

describe("local ingest latency", () => {
  it("resolves dates and parses a capture in well under a network round trip", () => {
    const ops = 200;
    const dateStarted = performance.now();
    for (let i = 0; i < ops; i++) {
      for (const phrase of PHRASES) {
        resolveDueDateFromText(phrase, { timezone: TZ, referenceDate: REF });
      }
    }
    const dateMs = performance.now() - dateStarted;

    const parseStarted = performance.now();
    for (let i = 0; i < ops; i++) {
      for (const phrase of PHRASES) {
        parseInputLocally({
          text: phrase,
          timezone: TZ,
          referenceDate: REF,
          allowedTags: ["עבודה", "בית"],
        });
      }
    }
    const parseMs = performance.now() - parseStarted;
    const totalOps = ops * PHRASES.length;
    const dateUs = (dateMs / totalOps) * 1000;
    const parseUs = (parseMs / totalOps) * 1000;
    console.info(
      `[ingest-timing] ${JSON.stringify({
        path: "local-benchmark",
        ops: totalOps,
        datePerOpUs: Math.round(dateUs),
        parsePerOpUs: Math.round(parseUs),
      })}`,
    );
    assert.ok(dateUs < 5_000, `date resolver ${dateUs}µs`);
    assert.ok(parseUs < 15_000, `local parse ${parseUs}µs`);
  });
});
