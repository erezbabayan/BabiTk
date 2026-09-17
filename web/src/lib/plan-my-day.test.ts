import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planMyDayFocus, planMyDayOrder } from "./plan-my-day.js";
import type { MindtaskerItem } from "../types.js";

function item(overrides: Partial<MindtaskerItem> = {}): MindtaskerItem {
  return {
    id: overrides.id ?? "1",
    user_id: "user",
    source_material_id: null,
    title: "פריט",
    content: "",
    is_actionable: true,
    status: "pending",
    due_date: null,
    completed_at: null,
    tags: [],
    metadata: null,
    sort_order: 10,
    last_interacted_at: "2026-09-17T08:00:00.000Z",
    created_at: "2026-09-17T08:00:00.000Z",
    updated_at: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

describe("plan my day", () => {
  const now = Date.parse("2026-09-17T12:00:00.000Z");

  it("orders overdue before due today before priority before undated", () => {
    const undated = item({ id: "later", due_date: null });
    const today = item({ id: "today", due_date: "2026-09-17T18:00:00.000Z" });
    const overdue = item({ id: "past", due_date: "2026-09-16T09:00:00.000Z" });
    const starred = item({ id: "star", due_date: null, metadata: { priority: true } });

    const ordered = planMyDayOrder([undated, starred, today, overdue], now).map(
      (entry) => entry.id,
    );
    assert.deepEqual(ordered, ["past", "today", "star", "later"]);
  });

  it("focuses on overdue, today, and starred items", () => {
    const items = [
      item({ id: "today", due_date: "2026-09-17T18:00:00.000Z" }),
      item({ id: "later", due_date: "2026-09-20T09:00:00.000Z" }),
      item({ id: "star", metadata: { priority: true } }),
    ];
    assert.deepEqual(
      planMyDayFocus(items, now).map((entry) => entry.id),
      ["today", "star"],
    );
  });
});
