import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rtlDropdownPlacement, DROPDOWN_MIN_WIDTH } from "./dropdown-position.ts";

describe("rtlDropdownPlacement", () => {
  it("widens a narrow trigger instead of squeezing the chips", () => {
    // 100px trigger on the left of a 360px phone (the reported bug).
    const p = rtlDropdownPlacement(12, 100, 360);
    assert.equal(p.width, DROPDOWN_MIN_WIDTH);
    // Clamped so it starts inside the screen.
    assert.equal(12 + p.left, 8);
  });

  it("aligns the right edges when there is room (RTL)", () => {
    const p = rtlDropdownPlacement(200, 120, 400);
    assert.equal(200 + p.left + p.width, 320);
  });

  it("never exceeds the screen", () => {
    const p = rtlDropdownPlacement(0, 100, 200);
    assert.equal(p.width, 184);
    assert.equal(p.left, 8);
  });

  it("keeps a wide trigger's width up to the max", () => {
    assert.equal(rtlDropdownPlacement(0, 280, 800).width, 280);
    assert.equal(rtlDropdownPlacement(0, 600, 800).width, 320);
  });
});
