import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hebrewDayMark, hebrewDayTooltip, hebrewMonthHeading } from "./hebrew-calendar.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Hebrew calendar marks", () => {
  it("renders 15 Tishrei as ט״ו, not יה", () => {
    const sukkot = hebrewDayMark("2026-09-26");
    assert.ok(sukkot);
    assert.equal(sukkot.dayLabel, "ט״ו");
    assert.equal(sukkot.monthLabel, "תשרי");
    assert.equal(sukkot.yearLabel, "תשפ״ז");
    assert.equal(sukkot.full, "ט״ו בתשרי תשפ״ז");
    assert.match(sukkot.holiday ?? "", /סוכות/);
    assert.equal(sukkot.marker, "holiday");
    assert.equal(hebrewDayTooltip(sukkot), `${sukkot.full} · ${sukkot.holiday}`);
  });

  it("renders 16 as ט״ז", () => {
    const next = hebrewDayMark("2026-09-27");
    assert.equal(next?.dayLabel, "ט״ז");
  });

  it("uses the Israel schedule: Pesach is seven days", () => {
    const first = hebrewDayMark("2026-04-02");
    const seventh = hebrewDayMark("2026-04-08");
    const eighth = hebrewDayMark("2026-04-09");
    assert.match(first?.holiday ?? "", /פסח/);
    assert.match(seventh?.holiday ?? "", /פסח/);
    assert.equal(eighth?.marker === "holiday" && /פסח/.test(eighth.holiday ?? ""), false);
    assert.equal(eighth?.holiday, null);
  });

  it("marks Yom Kippur and a plain Saturday differently", () => {
    const kippur = hebrewDayMark("2026-09-21");
    assert.match(kippur?.holiday ?? "", /כיפור/);
    assert.equal(kippur?.marker, "holiday");
    const saturday = hebrewDayMark("2026-10-10");
    assert.equal(saturday?.shabbat, true);
    assert.equal(saturday?.holiday, null);
    assert.equal(saturday?.marker, "shabbat");
  });

  it("marks erev Pesach and an Israel modern holiday", () => {
    const erev = hebrewDayMark("2026-04-01");
    assert.match(erev?.holiday ?? "", /ערב פסח/);
    assert.match(erev?.holiday ?? "", /תענית בכורות/);
    const memorial = hebrewDayMark("2026-04-21");
    assert.equal(memorial?.marker, "holiday");
    assert.match(memorial?.holiday ?? "", /הזיכרון/);
  });

  it("names both Hebrew months when a civil month crosses the year", () => {
    assert.equal(
      hebrewMonthHeading(2026, 9),
      "אלול תשפ״ו – תשרי תשפ״ז",
    );
    const october = hebrewMonthHeading(2026, 10);
    assert.equal(october, "תשרי–חשוון תשפ״ז");
  });

  it("returns the same object for the same day", () => {
    assert.equal(hebrewDayMark("2026-10-06"), hebrewDayMark("2026-10-06"));
  });

  it("rejects a bad date", () => {
    assert.equal(hebrewDayMark("2026-13-01"), null);
    assert.equal(hebrewDayMark("nope"), null);
  });

  it("matches the mobile copy", () => {
    const web = readFileSync(join(here, "hebrew-calendar.ts"), "utf8");
    const mobile = readFileSync(
      join(here, "../../../mobile/src/lib/hebrew-calendar.ts"),
      "utf8",
    );
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    assert.equal(hash(web), hash(mobile));
  });
});
