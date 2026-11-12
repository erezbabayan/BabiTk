import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCardPress } from "./card-press.ts";

describe("item card press", () => {
  it("opens the editor on a single tap", () => {
    assert.equal(resolveCardPress({ selecting: false, longPressFired: false }), "edit");
  });

  it("does not open the editor when the press ended a long-press", () => {
    assert.equal(resolveCardPress({ selecting: false, longPressFired: true }), "none");
  });

  it("toggles selection in selection mode", () => {
    assert.equal(resolveCardPress({ selecting: true, longPressFired: false }), "toggle-select");
    assert.equal(resolveCardPress({ selecting: true, longPressFired: true }), "toggle-select");
  });
});
