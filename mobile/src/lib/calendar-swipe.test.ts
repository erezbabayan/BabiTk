import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("calendar day items reuse the board swipeable card (archive/delete + undo)", () => {
  const calendar = readFileSync(join(here, "../components/TaskMonthCalendar.tsx"), "utf8");
  const app = readFileSync(join(here, "../../App.tsx"), "utf8");
  assert.match(calendar, /renderItem\?: \(item: MindtaskerItem\) => ReactNode/);
  assert.match(calendar, /renderItem\(item\)/);
  assert.match(calendar, /renderItem\(hit\.item\)/);
  assert.match(app, /renderItem=\{renderCalendarItem\}/);
  assert.match(app, /renderBoardItem\(\{ item, calendarCell: true \}\)/);
});
