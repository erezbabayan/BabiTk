import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWidgetSnapshot,
  formatWidgetUpdated,
  isWidgetSnapshotStale,
  nextWidgetBoard,
  parseWidgetLink,
  parseWidgetSnapshot,
  signedOutSnapshot,
  snapshotsEqualIgnoringTime,
  toWidgetItem,
  visibleWidgetItems,
  widgetAddUri,
  widgetBoardUri,
  widgetItemUri,
  widgetSizeForHeight,
  WIDGET_MAX_ITEMS,
  WIDGET_STALE_MS,
} from "./widget-model.ts";

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `פריט ${id}`,
  content: "",
  is_actionable: false,
  due_date: null,
  ...extra,
});

describe("widget board switching", () => {
  it("wraps around in app order both ways", () => {
    assert.equal(nextWidgetBoard("inbox", 1), "today");
    assert.equal(nextWidgetBoard("today", 1), "notes");
    assert.equal(nextWidgetBoard("notes", 1), "inbox");
    assert.equal(nextWidgetBoard("inbox", -1), "notes");
    assert.equal(nextWidgetBoard("notes", -1), "today");
  });
});

describe("widget snapshot", () => {
  it("keeps full counts but caps stored items", () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`n${i}`));
    const snap = buildWidgetSnapshot({ inbox: [item("a")], today: [], notes: many }, 1000);
    assert.equal(snap.boards.notes.count, 40);
    assert.equal(snap.boards.notes.items.length, WIDGET_MAX_ITEMS);
    assert.equal(snap.boards.inbox.items[0].title, "פריט a");
    assert.equal(snap.signedIn, true);
    assert.equal(snap.updatedAt, 1000);
  });

  it("round-trips through JSON and rejects junk", () => {
    const snap = buildWidgetSnapshot({ inbox: [], today: [item("t")], notes: [] });
    assert.deepEqual(parseWidgetSnapshot(JSON.stringify(snap)), snap);
    assert.equal(parseWidgetSnapshot("not json"), null);
    assert.equal(parseWidgetSnapshot(JSON.stringify({ version: 99 })), null);
    assert.equal(parseWidgetSnapshot(null), null);
  });

  it("compares content without the timestamp", () => {
    const a = buildWidgetSnapshot({ inbox: [item("a")], today: [], notes: [] }, 1);
    const b = buildWidgetSnapshot({ inbox: [item("a")], today: [], notes: [] }, 2);
    assert.equal(snapshotsEqualIgnoringTime(a, b), true);
    assert.equal(snapshotsEqualIgnoringTime(a, signedOutSnapshot()), false);
    assert.equal(snapshotsEqualIgnoringTime(null, b), false);
  });

  it("uses content when the title is empty and shows due time for tasks", () => {
    const due = new Date(2026, 10, 23, 9, 5).toISOString();
    const w = toWidgetItem(item("x", { title: "", content: "שורה ראשונה\nשנייה", is_actionable: true, due_date: due }));
    assert.equal(w.title, "שורה ראשונה");
    assert.equal(w.subtitle, "23.11 · 09:05");
    assert.equal(w.isTask, true);
  });

  it("marks stale snapshots", () => {
    const snap = buildWidgetSnapshot({ inbox: [], today: [], notes: [] }, 0);
    assert.equal(isWidgetSnapshotStale(snap, WIDGET_STALE_MS - 1), false);
    assert.equal(isWidgetSnapshotStale(snap, WIDGET_STALE_MS + 1), true);
  });
});

describe("widget sizes", () => {
  it("medium shows 3 items and the rest as a count", () => {
    const snap = buildWidgetSnapshot(
      { inbox: Array.from({ length: 7 }, (_, i) => item(`i${i}`)), today: [], notes: [] },
    );
    const medium = visibleWidgetItems(snap.boards.inbox, "medium");
    assert.equal(medium.items.length, 3);
    assert.equal(medium.moreCount, 4);
    assert.equal(visibleWidgetItems(snap.boards.inbox, "large").moreCount, 0);
    assert.equal(widgetSizeForHeight(150), "medium");
    assert.equal(widgetSizeForHeight(300), "large");
  });

  it("formats the updated label in Hebrew", () => {
    assert.equal(formatWidgetUpdated(0, 30_000), "עודכן עכשיו");
    assert.equal(formatWidgetUpdated(0, 5 * 60_000), "עודכן לפני 5 דק׳");
    assert.equal(formatWidgetUpdated(0, 3 * 3600_000), "עודכן לפני 3 שעות");
  });
});

describe("widget deep links", () => {
  it("round-trips item, board and add links", () => {
    const id = "3f2a9c1e-1111-4abc-9def-123456789abc";
    assert.deepEqual(parseWidgetLink(widgetItemUri(id)), { kind: "item", id });
    assert.deepEqual(parseWidgetLink(widgetBoardUri("notes")), { kind: "board", board: "notes" });
    assert.deepEqual(parseWidgetLink(widgetAddUri("today")), { kind: "add", board: "today" });
  });

  it("ignores other app links and bad input", () => {
    assert.equal(parseWidgetLink("mindtasker://auth-callback?code=x"), null);
    assert.equal(parseWidgetLink("https://example.com/item/1"), null);
    assert.equal(parseWidgetLink("mindtasker://board/archive"), null);
    assert.equal(parseWidgetLink("mindtasker://item/..%2F..%2Fx"), null);
    assert.equal(parseWidgetLink("mindtasker://item/a/b"), null);
    assert.equal(parseWidgetLink(null), null);
  });
});
