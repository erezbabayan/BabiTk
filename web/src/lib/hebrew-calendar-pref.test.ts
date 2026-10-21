import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHebrewCalendarEnabled, writeHebrewCalendarEnabled } from "./hebrew-calendar-pref.ts";

const store = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
});

describe("hebrew calendar preference", () => {
  it("stays off until the user turns it on", () => {
    store.clear();
    assert.equal(readHebrewCalendarEnabled(), false);
    writeHebrewCalendarEnabled(true);
    assert.equal(readHebrewCalendarEnabled(), true);
    writeHebrewCalendarEnabled(false);
    assert.equal(readHebrewCalendarEnabled(), false);
  });
});
