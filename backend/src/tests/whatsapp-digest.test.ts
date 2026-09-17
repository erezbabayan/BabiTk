import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  appendDigestSlot,
  buildWhatsAppDigestMessage,
  digestSlotKey,
  isDigestDayAllowed,
  isSameLocalDay,
  resolveDigestDays,
  resolveDigestHours,
} from "../lib/whatsapp-digest.js";
import { resolveItemNotifyAt } from "../lib/whatsapp-reminder-message.js";

describe("WhatsApp digest scheduling", () => {
  it("defaults to 09:00 and keeps up to three hours", () => {
    assert.deepEqual(resolveDigestHours(null), [9]);
    assert.deepEqual(resolveDigestHours([9, 18, 21, 7]), [7, 9, 18]);
  });

  it("sends on weekdays Sunday–Thursday only", () => {
    assert.equal(isDigestDayAllowed(0, "weekdays"), true);
    assert.equal(isDigestDayAllowed(4, "weekdays"), true);
    assert.equal(isDigestDayAllowed(5, "weekdays"), false);
    assert.equal(isDigestDayAllowed(5, "everyday"), true);
    assert.equal(resolveDigestDays("weekdays"), "weekdays");
  });

  it("keeps only today's digest slots", () => {
    assert.equal(digestSlotKey("2026-09-17", 9), "2026-09-17:9");
    assert.deepEqual(
      appendDigestSlot(["2026-09-16:9", "2026-09-17:9"], "2026-09-17:18", "2026-09-17"),
      ["2026-09-17:9", "2026-09-17:18"],
    );
  });

  it("matches reminders on the same Jerusalem day", () => {
    const now = new Date("2026-09-17T10:00:00+03:00");
    assert.equal(isSameLocalDay("2026-09-17T08:30:00+03:00", now), true);
    assert.equal(isSameLocalDay("2026-09-16T22:00:00+03:00", now), false);
  });
});

describe("WhatsApp digest copy", () => {
  it("lists today's reminders in Hebrew", () => {
    const message = buildWhatsAppDigestMessage(
      [
        { kind: "task", title: "לקנות חלב", fireAt: "2026-09-17T09:00:00+03:00" },
        { kind: "list", title: "סידורים", fireAt: "2026-09-17T18:00:00+03:00" },
      ],
      "2026-09-17",
    );
    assert.match(message, /ריכוז תזכורות/);
    assert.match(message, /לקנות חלב/);
    assert.match(message, /סידורים/);
    assert.match(message, /כל תזכורת נשלחת גם בזמן שמוגדר לה/);
  });
});

describe("item notify time", () => {
  it("uses analysis.notify_at for tasks", () => {
    assert.equal(
      resolveItemNotifyAt({
        is_actionable: true,
        due_date: "2026-09-17T12:00:00.000Z",
        metadata: { analysis: { notify_at: "2026-09-17T08:00:00.000Z" } },
      }),
      "2026-09-17T08:00:00.000Z",
    );
  });

  it("fires notes when they have a due date", () => {
    assert.equal(
      resolveItemNotifyAt({
        is_actionable: false,
        due_date: "2026-09-17T12:00:00.000Z",
        metadata: {},
      }),
      "2026-09-17T12:00:00.000Z",
    );
  });
});
