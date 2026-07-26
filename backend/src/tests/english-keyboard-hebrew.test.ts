import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { correctEnglishKeyboardHebrew } from "../lib/ingest/englishKeyboardHebrew.js";

describe("correctEnglishKeyboardHebrew", () => {
  it("converts mistyped Hebrew from English layout", () => {
    assert.equal(correctEnglishKeyboardHebrew("nhsg jsa"), "מידע חדש");
    assert.equal(correctEnglishKeyboardHebrew(",zfur,"), "תזכורת");
    assert.equal(correctEnglishKeyboardHebrew(",ufbu,"), "תוכנות");
    assert.equal(correctEnglishKeyboardHebrew("akuo"), "שלום");
  });

  it("leaves real English alone", () => {
    assert.equal(
      correctEnglishKeyboardHebrew("buy milk tomorrow"),
      "buy milk tomorrow",
    );
    assert.equal(correctEnglishKeyboardHebrew("hello"), "hello");
    assert.equal(correctEnglishKeyboardHebrew("check please"), "check please");
  });

  it("leaves already-Hebrew text alone", () => {
    assert.equal(
      correctEnglishKeyboardHebrew("לקנות חלב מחר"),
      "לקנות חלב מחר",
    );
  });

  it("keeps English tokens inside a mostly-mistyped Hebrew sentence", () => {
    const input = "check, nhsg jsa";
    const out = correctEnglishKeyboardHebrew(input);
    assert.match(out, /מידע חדש/);
    assert.match(out, /check/i);
  });

  it("does not rewrite URLs", () => {
    const url = "https://example.com/path";
    assert.equal(correctEnglishKeyboardHebrew(url), url);
  });
});
