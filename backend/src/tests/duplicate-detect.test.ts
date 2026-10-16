import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterDuplicateParsedItems } from "../lib/duplicate-detect.ts";

describe("filterDuplicateParsedItems", () => {
  it("skips recapture when the same notebook text was already deleted", () => {
    const existing = [
      { title: "לקנות חלב", content: "לקנות חלב מחר" },
    ];
    const parsed = [
      { title: "לקנות חלב", content: "לקנות חלב מחר" },
      { title: "משימה חדשה", content: "להתקשר לדני" },
    ];
    assert.deepEqual(
      filterDuplicateParsedItems(parsed, existing).map((row) => row.title),
      ["משימה חדשה"],
    );
  });

  it("returns nothing when every parsed row matches a tombstone", () => {
    const existing = [{ title: "הערה מהמחברת", content: "שורה אחת" }];
    const parsed = [{ title: "הערה מהמחברת", content: "שורה אחת" }];
    assert.deepEqual(filterDuplicateParsedItems(parsed, existing), []);
  });
});
