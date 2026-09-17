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

describe("hebrew ASR slang and ktiv male", () => {
  it("fixes Israeli slang Whisper usually mangles", () => {
    assert.equal(applyHebrewAsrSpellingFixes("יאלה סבבא וואלא"), "יאללה סבבה וואלה");
    assert.equal(applyHebrewAsrSpellingFixes("תכלסס אחלא אוקי"), "תכלס אחלה אוקיי");
    assert.equal(applyHebrewAsrSpellingFixes("פדיחה כייף מגנייב"), "פאדיחה כיף מגניב");
  });

  it("preserves clitics on slang and names (Hspell-style prefixes)", () => {
    assert.equal(applyHebrewAsrSpellingFixes("ליאלה ולרואי"), "ליאללה ולרועי");
    assert.equal(applyHebrewAsrSpellingFixes("בבקה"), "בבקשה");
    assert.equal(applyHebrewAsrSpellingFixes("לבבקה"), "לבבקשה");
  });

  it("joins Whisper clitic splits", () => {
    assert.equal(applyHebrewAsrSpellingFixes("ל קנות חלב מחר ב צהריים"), "לקנות חלב מחר בצהריים");
    assert.equal(applyHebrewAsrSpellingFixes("ב בקשה תזכרת ב שעה שש"), "בבקשה תזכורת בשעה שש");
    assert.equal(applyHebrewAsrSpellingFixes("ל התקשר לרואי"), "להתקשר לרועי");
  });

  it("fixes ktiv male and time slang", () => {
    assert.equal(applyHebrewAsrSpellingFixes("תזכרת מחרתים אחהצ"), "תזכורת מחרתיים אחה״צ");
    assert.equal(applyHebrewAsrSpellingFixes("משימה לסופש"), "משימה לסופ״ש");
    assert.equal(applyHebrewAsrSpellingFixes("בשעב שעהה"), "בשעה שעה");
  });

  it("is idempotent on already-correct spoken Hebrew", () => {
    const clean = "יאללה לקנות חלב מחר בצהריים בבקשה תזכורת לרועי";
    assert.equal(applyHebrewAsrSpellingFixes(clean), clean);
    assert.equal(applyHebrewAsrSpellingFixes(applyHebrewAsrSpellingFixes(clean)), clean);
  });

  it("does not eat אוקיי into אוקייי", () => {
    assert.equal(applyHebrewAsrSpellingFixes("אוקיי סבבה"), "אוקיי סבבה");
    assert.equal(applyHebrewAsrSpellingFixes("יאללה"), "יאללה");
  });
});
