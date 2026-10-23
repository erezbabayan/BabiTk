import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeEqual } from "../lib/safe-compare.js";

describe("safeEqual", () => {
  it("matches equal secrets and rejects others", () => {
    assert.equal(safeEqual("abc123", "abc123"), true);
    assert.equal(safeEqual("abc123", "abc124"), false);
    assert.equal(safeEqual("abc", "abc123"), false);
    assert.equal(safeEqual("", ""), false);
    assert.equal(safeEqual(undefined, "x"), false);
  });
});
