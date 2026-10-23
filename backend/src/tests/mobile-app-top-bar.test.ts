import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("mobile app top bar", () => {
  const bar = read("mobile/src/components/AppTopBar.tsx");
  const app = read("mobile/App.tsx");

  it("switches to a compact single row on phone widths", () => {
    assert.match(bar, /TOP_BAR_COMPACT_MAX_WIDTH = 600/);
    assert.match(bar, /useWindowDimensions/);
    assert.match(bar, /<BoardViewToggle[^>]*compact=\{compact\}/s);
  });

  it("keeps accessible labels on icon-only actions", () => {
    for (const label of ["הגדרות", "התנתק", "התראות", "Premium", "חזרה למסך הראשי"]) {
      assert.ok(bar.includes(`accessibilityLabel="${label}"`), `missing label ${label}`);
    }
  });

  it("is used by App.tsx instead of the inline header", () => {
    assert.match(app, /<AppTopBar/);
    assert.doesNotMatch(app, /styles\.topBarLink/);
  });

  it("toggle can hide its text label", () => {
    const toggle = read("mobile/src/components/BoardViewToggle.tsx");
    assert.match(toggle, /compact\?: boolean/);
  });
});
