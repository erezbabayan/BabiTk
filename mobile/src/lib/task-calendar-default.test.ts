import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("tasks board opens in calendar unless the user explicitly picked list/squares (v2 key)", () => {
  const lib = readFileSync(join(here, "board-item-view.ts"), "utf8");
  const app = readFileSync(join(here, "../../App.tsx"), "utf8");
  assert.match(lib, /babitk\.taskBoardCalendar\.v2/);
  assert.match(lib, /raw === "0" \? false : true/);
  assert.match(app, /useState\(true\);/);
  assert.match(app, /writeTaskCalendarPref\(false\)/);
  assert.match(app, /writeTaskCalendarPref\(true\)/);
});
