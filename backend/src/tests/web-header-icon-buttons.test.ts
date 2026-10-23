import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

describe("web header phone buttons", () => {
  const shell = readFileSync(path.join(root, "web/src/components/AppShell.tsx"), "utf8");
  it("settings and logout are icon-only below sm with aria labels", () => {
    for (const label of ["הגדרות", "התנתק"]) {
      assert.ok(shell.includes(`aria-label="${label}"`), `missing aria-label ${label}`);
      assert.ok(shell.includes(`<span className="hidden sm:inline">${label}</span>`), `label ${label} not hidden on phones`);
    }
    assert.equal(shell.match(/className="h-5 w-5 sm:hidden"/g)?.length, 2);
  });
});
