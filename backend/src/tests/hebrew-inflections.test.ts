import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractTimeOfDay } from "../utils/hebrew-time-words.js";
import { resolveDueDateFromText } from "../services/hebrew-date-resolver.service.js";

const TZ = "Asia/Jerusalem";
/** Wednesday 2026-06-24 12:00 */
const REF = new Date("2026-06-24T12:00:00+03:00");

function due(text: string): string | null {
  return resolveDueDateFromText(text, { timezone: TZ, referenceDate: REF });
}

describe("Hebrew inflections — day-after-tomorrow", () => {
  it("מחרתיים (+2 days)", () => {
    assert.match(due("להתקשר מחרתיים")!, /2026-06-26T09:00:00\+03:00/);
  });

  it("ממחרתיים still works", () => {
    assert.match(due("להתקשר ממחרתיים")!, /2026-06-26T09:00:00\+03:00/);
  });

  it("מחרתיים בערב", () => {
    assert.match(due("פגישה מחרתיים בערב")!, /2026-06-26T19:00:00\+03:00/);
  });
});

describe("Hebrew inflections — weekday letters & names", () => {
  it("ביום א׳ → next Sunday", () => {
    assert.match(due("פגישה ביום א׳ בבוקר")!, /2026-06-28T09:00:00\+03:00/);
  });

  it("יום ה׳ → next Thursday", () => {
    assert.match(due("דדליין יום ה׳")!, /2026-06-25T09:00:00\+03:00/);
  });

  it("ביום הראשון", () => {
    assert.match(due("שיחה ביום הראשון בעשר בבוקר")!, /2026-06-28T10:00:00\+03:00/);
  });

  it("ליום שני שלישי morning default via ליום", () => {
    assert.match(due("לקבוע ליום שני")!, /2026-06-29T09:00:00\+03:00/);
  });

  it("does not treat לשבת על זה as Saturday", () => {
    assert.equal(due("לשבת על התכנון"), null);
  });
});

describe("Hebrew inflections — relative hours & minutes", () => {
  it("בעוד שעתיים", () => {
    assert.match(due("תזכיר לי בעוד שעתיים")!, /2026-06-24T14:00:00\+03:00/);
  });

  it("עוד שעה", () => {
    assert.match(due("עוד שעה להתקשר")!, /2026-06-24T13:00:00\+03:00/);
  });

  it("בעוד 3 שעות", () => {
    assert.match(due("בעוד 3 שעות")!, /2026-06-24T15:00:00\+03:00/);
  });

  it("בעוד חצי שעה", () => {
    assert.match(due("בעוד חצי שעה")!, /2026-06-24T12:30:00\+03:00/);
  });

  it("עוד רבע שעה", () => {
    assert.match(due("עוד רבע שעה")!, /2026-06-24T12:15:00\+03:00/);
  });

  it("בעוד 20 דקות", () => {
    assert.match(due("בעוד 20 דקות")!, /2026-06-24T12:20:00\+03:00/);
  });

  it("עוד מעט → +15m", () => {
    assert.match(due("עוד מעט לקנות חלב")!, /2026-06-24T12:15:00\+03:00/);
  });

  it("עוד רגע → +5m", () => {
    assert.match(due("עוד רגע")!, /2026-06-24T12:05:00\+03:00/);
  });
});

describe("Hebrew inflections — afternoon, midnight, half hour", () => {
  it("חמש אחה״צ → 17:00", () => {
    assert.deepEqual(extractTimeOfDay("פגישה חמש אחה״צ"), {
      hour: 17,
      minute: 0,
      raw: "חמש אחה״צ",
    });
    assert.match(due("פגישה חמש אחה״צ")!, /2026-06-24T17:00:00\+03:00/);
  });

  it("אחר הצהריים alone → 15:00", () => {
    assert.match(due("לטייל אחר הצהריים")!, /2026-06-24T15:00:00\+03:00/);
  });

  it("חמש וחצי", () => {
    const withB = extractTimeOfDay("בשעה חמש וחצי");
    assert.equal(withB?.hour, 5);
    assert.equal(withB?.minute, 30);
    const bare = extractTimeOfDay("תזכורת חמש וחצי");
    assert.equal(bare?.hour, 5);
    assert.equal(bare?.minute, 30);
  });

  it("בחצות → next midnight", () => {
    assert.match(due("תזכורת בחצות")!, /2026-06-25T00:00:00\+03:00/);
  });

  it("סופ״ש → Thursday 17:00", () => {
    assert.match(due("משימה לסופ״ש")!, /2026-06-25T17:00:00\+03:00/);
  });

  it("סופש synonym", () => {
    assert.match(due("לסיים בסופש")!, /2026-06-25T17:00:00\+03:00/);
  });
});

describe("Hebrew inflections — months & next week forms", () => {
  it("בחודש הבא", () => {
    assert.match(due("לשלם בחודש הבא")!, /2026-07-24T09:00:00\+03:00/);
  });

  it("בעוד חודשיים", () => {
    assert.match(due("בדיקה בעוד חודשיים")!, /2026-08-24T09:00:00\+03:00/);
  });

  it("בשבוע הבא", () => {
    assert.match(due("פגישה בשבוע הבא")!, /2026-07-01T09:00:00\+03:00/);
  });
});
