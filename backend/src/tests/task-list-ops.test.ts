import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultTaskListName } from "../../../convex/lib/taskListNames.js";
import {
  isMissingTaskListsTableError,
  nextTaskListSortOrder,
  normalizeListFilterTags,
  plansForNewListsFromTags,
  taskListRecordToRow,
  taskListRowToRecord,
  validateListName,
} from "../../../convex/lib/taskListOps.js";

describe("task list ops", () => {
  it("normalizes tags like the old Convex create mutation", () => {
    assert.deepEqual(normalizeListFilterTags([" #בית ", "עבודה", "בית", ""]), [
      "בית",
      "עבודה",
    ]);
  });

  it("creates one list per selected tag", () => {
    const now = Date.parse("2026-09-16T12:00:00+03:00");
    const plans = plansForNewListsFromTags({
      filterTags: ["בית", "עבודה"],
      name: "שם מותאם",
      nextSortOrder: 3,
      nowMs: now,
    });

    assert.equal(plans.length, 2);
    assert.equal(plans[0]?.filterTags[0], "בית");
    assert.equal(plans[1]?.filterTags[0], "עבודה");
    assert.equal(plans[0]?.sortOrder, 3);
    assert.equal(plans[1]?.sortOrder, 4);
    assert.equal(plans[0]?.name, defaultTaskListName(["בית"], now));
    assert.notEqual(plans[0]?.name, "שם מותאם");
  });

  it("applies a custom name only for a single-tag list", () => {
    const plans = plansForNewListsFromTags({
      filterTags: ["בית"],
      name: "קניות לסוף שבוע",
      nextSortOrder: 0,
      nowMs: 1,
    });
    assert.equal(plans[0]?.name, "קניות לסוף שבוע");
  });

  it("rejects empty tag selection and empty names", () => {
    assert.throws(
      () =>
        plansForNewListsFromTags({
          filterTags: ["  ", "#"],
          nextSortOrder: 0,
        }),
      /תגית/,
    );
    assert.throws(() => validateListName("   "), /שם הרשימה/);
  });

  it("round-trips a supabase row into the UI record shape", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      name: "בית · 16.9.2026",
      filter_tags: ["בית"],
      reminder_at: null,
      status: "active" as const,
      sort_order: 2,
      created_at: "2026-09-16T09:00:00.000Z",
      updated_at: "2026-09-16T10:00:00.000Z",
      deleted_at: null,
    };
    const record = taskListRowToRecord(row);
    assert.equal(record._id, row.id);
    assert.equal(record.userId, row.user_id);
    assert.deepEqual(record.filterTags, ["בית"]);
    assert.deepEqual(record.items, []);
    assert.deepEqual(taskListRecordToRow(record).filter_tags, ["בית"]);
  });

  it("computes the next sort order from existing lists", () => {
    assert.equal(nextTaskListSortOrder([]), 0);
    assert.equal(nextTaskListSortOrder([{ sortOrder: 1 }, { sortOrder: 4 }]), 5);
  });

  it("detects a missing task_lists table so the UI can fall back", () => {
    assert.equal(
      isMissingTaskListsTableError({
        code: "PGRST205",
        message: "Could not find the table 'public.task_lists' in the schema cache",
      }),
      true,
    );
    assert.equal(
      isMissingTaskListsTableError({ code: "42501", message: "permission denied" }),
      false,
    );
  });
});
