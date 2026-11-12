import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isIgnorableBoardSearchError,
  isLegacyExpressApiAvailable,
  shouldRunRemoteBoardSearch,
  shouldUseLegacyCompleteApi,
} from "./board-search.ts";

describe("board search remote API gating", () => {
  it("skips remote search on GitHub Pages (no Express API URL)", () => {
    assert.equal(isLegacyExpressApiAvailable(""), false);
    assert.equal(isLegacyExpressApiAvailable("   "), false);
    assert.equal(isLegacyExpressApiAvailable(undefined), false);
    assert.equal(shouldRunRemoteBoardSearch(false, false), false);
  });

  it("skips remote search when Convex holds items in memory", () => {
    assert.equal(shouldRunRemoteBoardSearch(true, true), false);
  });

  it("runs remote search only when Express is explicitly configured", () => {
    assert.equal(isLegacyExpressApiAvailable("https://api.example.com"), true);
    assert.equal(shouldRunRemoteBoardSearch(false, true), true);
  });

  it("does not surface Pages 405/404 as a search notice", () => {
    assert.equal(isIgnorableBoardSearchError(new Error("API error 405")), true);
    assert.equal(isIgnorableBoardSearchError(new Error("API error 404")), true);
    assert.equal(isIgnorableBoardSearchError(new Error("Search failed: 405")), true);
    assert.equal(isIgnorableBoardSearchError(new Error("Failed to fetch")), true);
    assert.equal(isIgnorableBoardSearchError(new Error("חיפוש נכשל")), false);
  });

  it("marks done directly (no 405 round trip) without an Express API URL", () => {
    assert.equal(shouldUseLegacyCompleteApi(undefined), false);
    assert.equal(shouldUseLegacyCompleteApi(""), false);
    assert.equal(shouldUseLegacyCompleteApi("https://api.example.com"), true);
  });
});
