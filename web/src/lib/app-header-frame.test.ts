import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("app header stays inside the phone frame", () => {
  const css = readFileSync(join(here, "../index.css"), "utf8");
  const header = readFileSync(join(here, "../components/AppHeader.tsx"), "utf8");

  it("insets the header from the physical right edge including the safe area", () => {
    assert.match(css, /padding-right:\s*max\([^)]*safe-area-inset-right/);
    assert.match(header, /w-full max-w-full/);
    assert.match(header, /min-w-0 max-w-full justify-self-end/);
  });

  it("hides the view-toggle label on phones so logout stays on-screen", () => {
    assert.match(css, /\.board-view-toggle__label \{\s*@apply hidden whitespace-nowrap lg:inline;/);
    assert.doesNotMatch(css, /\.board-view-toggle__label \{[^}]*display:\s*inline/);
  });
});
