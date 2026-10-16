import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveTaskBoardView } from "./board-item-view.ts";

describe("task board view", () => {
  it("defaults to calendar when the calendar flag is on", () => {
    assert.equal(resolveTaskBoardView(true, "list"), "calendar");
    assert.equal(resolveTaskBoardView(true, "squares"), "calendar");
  });

  it("uses rows or cubes when calendar is off", () => {
    assert.equal(resolveTaskBoardView(false, "list"), "list");
    assert.equal(resolveTaskBoardView(false, "squares"), "squares");
  });
});
