import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyHebrewAsrSpellingFixes } from "../lib/ingest/hebrewAsrSpelling.js";

describe("hebrew ASR spelling fixes", () => {
  it("corrects רואי to רועי", () => {
    assert.equal(
      applyHebrewAsrSpellingFixes("להתקשר לרואי מחר"),
      "להתקשר לרועי מחר",
    );
  });

  it("corrects standalone רואי", () => {
    assert.equal(applyHebrewAsrSpellingFixes("רואי"), "רועי");
  });

  it("corrects גיי to גיא and אידו to עידו", () => {
    assert.equal(
      applyHebrewAsrSpellingFixes("לפגוש את גיי ואת אידו"),
      "לפגוש את גיא ואת עידו",
    );
  });

  it("does not change רועי when already correct", () => {
    assert.equal(
      applyHebrewAsrSpellingFixes("תזכורת לרועי"),
      "תזכורת לרועי",
    );
  });
});
