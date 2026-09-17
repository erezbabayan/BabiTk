import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  entriesFromTitles,
  parseChecklist,
  toggleChecklistEntry,
  withChecklist,
} from "./checklist.js";

describe("checklist metadata", () => {
  it("parses valid entries and ignores junk", () => {
    const rows = parseChecklist({
      checklist: [
        { id: "a", text: "חלב", done: true },
        { text: "  לחם  " },
        { id: "x", text: "   " },
        "nope",
      ],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.id, "a");
    assert.equal(rows[0]?.done, true);
    assert.equal(rows[1]?.text, "לחם");
    assert.equal(rows[1]?.done, false);
  });

  it("toggles a row and writes metadata", () => {
    const start = entriesFromTitles(["א", "ב"]);
    const next = toggleChecklistEntry(start, start[0]!.id);
    assert.equal(next[0]?.done, true);
    assert.equal(next[1]?.done, false);
    const meta = withChecklist({ other: 1 }, next);
    assert.equal(meta.other, 1);
    assert.equal((meta.checklist as { text: string }[]).length, 2);
  });

  it("removes the key when the list is empty", () => {
    const meta = withChecklist({ checklist: [{ text: "x" }], keep: true }, []);
    assert.equal("checklist" in meta, false);
    assert.equal(meta.keep, true);
  });
});
