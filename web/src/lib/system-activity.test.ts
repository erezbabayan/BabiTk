import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { MindtaskerItem } from "../types.ts";
import {
  ACTIVITY_EXCEL_HEADERS,
  activityExcelFileName,
  activityEventsToSpreadsheetXml,
  buildActivityEvents,
  filterActivityEvents,
  formatActivityWhen,
  resolveActivityActor,
} from "./system-activity.ts";

const here = dirname(fileURLToPath(import.meta.url));

function item(partial: Partial<MindtaskerItem> & Pick<MindtaskerItem, "id" | "title">): MindtaskerItem {
  return {
    user_id: "user-1",
    source_material_id: null,
    content: partial.content ?? partial.title,
    is_actionable: partial.is_actionable ?? true,
    status: partial.status ?? "inbox",
    due_date: partial.due_date ?? null,
    completed_at: partial.completed_at ?? null,
    tags: partial.tags ?? [],
    metadata: partial.metadata ?? {},
    sort_order: 1,
    last_interacted_at: partial.created_at ?? "2026-10-20T08:00:00.000Z",
    created_at: partial.created_at ?? "2026-10-20T08:00:00.000Z",
    updated_at: partial.updated_at ?? partial.created_at ?? "2026-10-20T08:00:00.000Z",
    deleted_at: partial.deleted_at ?? null,
    ...partial,
  };
}

describe("system activity events", () => {
  it("emits created, completed and deleted with who/source/location", () => {
    const events = buildActivityEvents(
      [
        item({
          id: "a",
          title: "לקנות חלב",
          status: "completed",
          created_at: "2026-10-19T07:00:00.000Z",
          updated_at: "2026-10-19T09:00:00.000Z",
          completed_at: "2026-10-19T09:00:00.000Z",
          metadata: { source: "typed_text" },
        }),
        item({
          id: "b",
          title: "הודעת קבלן",
          status: "inbox",
          created_at: "2026-10-20T10:00:00.000Z",
          updated_at: "2026-10-20T10:00:00.000Z",
          metadata: {
            source: "whatsapp_text",
            chat_id: "120363aaa@g.us",
            catchup: true,
          },
        }),
      ],
      "ארז בבאיין",
    );

    const createdGroup = events.find((row) => row.itemId === "b" && row.kind === "created");
    assert.ok(createdGroup);
    assert.equal(createdGroup?.actor, "קבוצת וואטסאפ");
    assert.equal(createdGroup?.sourceLabel, "וואטסאפ");
    assert.match(createdGroup?.detail ?? "", /נמשך מהיסטוריית וואטסאפ/);
    assert.equal(createdGroup?.kindLabel, "נוצר");

    const completed = events.find((row) => row.itemId === "a" && row.kind === "completed");
    assert.ok(completed);
    assert.equal(completed?.actor, "ארז בבאיין");
    assert.equal(completed?.kindLabel, "הושלם");
    assert.equal(completed?.locationLabel, "הושלם");

    const typedCreated = events.find((row) => row.itemId === "a" && row.kind === "created");
    assert.equal(typedCreated?.actor, "ארז בבאיין");
    assert.equal(typedCreated?.sourceLabel, "הקלדה");
  });

  it("does not treat the create timestamp as an update", () => {
    const events = buildActivityEvents(
      [
        item({
          id: "c",
          title: "רק נוצר",
          created_at: "2026-10-20T11:00:00.000Z",
          updated_at: "2026-10-20T11:00:01.000Z",
        }),
      ],
      "ארז",
    );
    assert.deepEqual(
      events.map((row) => row.kind),
      ["created"],
    );
  });

  it("filters by Jerusalem calendar dates", () => {
    const events = buildActivityEvents(
      [
        item({
          id: "d1",
          title: "אתמול",
          created_at: "2026-10-19T08:00:00.000Z",
          updated_at: "2026-10-19T08:00:00.000Z",
        }),
        item({
          id: "d2",
          title: "היום",
          created_at: "2026-10-20T08:00:00.000Z",
          updated_at: "2026-10-20T08:00:00.000Z",
        }),
      ],
      "ארז",
    );
    const filtered = filterActivityEvents(events, { from: "2026-10-20", to: "2026-10-20" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.title, "היום");
  });

  it("builds an Excel spreadsheet with Hebrew headers and escaped titles", () => {
    const events = buildActivityEvents(
      [
        item({
          id: "x",
          title: 'קבלן & "הגדלה"',
          created_at: "2026-10-20T08:00:00.000Z",
          updated_at: "2026-10-20T08:00:00.000Z",
          metadata: { source: "typed_text" },
        }),
      ],
      "ארז",
    );
    const xml = activityEventsToSpreadsheetXml(events);
    for (const header of ACTIVITY_EXCEL_HEADERS) {
      assert.match(xml, new RegExp(header));
    }
    assert.match(xml, /קבלן &amp; &quot;הגדלה&quot;/);
    assert.match(xml, /ss:Name="פעילות"/);
    assert.equal(activityExcelFileName({ from: "2026-10-01", to: "2026-10-20" }), "פעילות-BabiTk-2026-10-01-2026-10-20.xls");
    assert.match(formatActivityWhen("2026-10-20T08:00:00.000Z"), /20\/10\/2026/);
  });

  it("emits archive and delete events separately from create", () => {
    const events = buildActivityEvents(
      [
        item({
          id: "arc",
          title: "נדחה",
          status: "snoozed_archive",
          created_at: "2026-10-18T08:00:00.000Z",
          updated_at: "2026-10-19T12:00:00.000Z",
        }),
        item({
          id: "gone",
          title: "נמחק",
          created_at: "2026-10-18T08:00:00.000Z",
          updated_at: "2026-10-20T09:00:00.000Z",
          deleted_at: "2026-10-20T09:00:00.000Z",
        }),
      ],
      "ארז",
    );
    const archived = events.find((row) => row.itemId === "arc" && row.kind === "archived");
    assert.ok(archived);
    assert.equal(archived?.kindLabel, "הועבר לארכיון");
    assert.equal(archived?.canOpen, true);
    const deleted = events.find((row) => row.itemId === "gone" && row.kind === "deleted");
    assert.ok(deleted);
    assert.equal(deleted?.kindLabel, "נמחק");
    assert.equal(deleted?.canOpen, false);
    assert.equal(deleted?.locationLabel, "נמחק");
  });

  it("names WhatsApp personal capture as the account owner", () => {
    assert.equal(
      resolveActivityActor(
        item({
          id: "p",
          title: "אישי",
          metadata: { source: "whatsapp_text", chat_id: "972501234567@c.us" },
        }),
        "ארז בבאיין",
        "created",
      ),
      "ארז בבאיין",
    );
  });
});

describe("system activity board placement", () => {
  it("puts the clock-arrow button next to the view toggle in the main header", () => {
    const shell = readFileSync(join(here, "../components/AppShell.tsx"), "utf8");
    const button = readFileSync(join(here, "../components/SystemActivityButton.tsx"), "utf8");
    const panel = readFileSync(join(here, "../components/SystemActivityPanel.tsx"), "utf8");
    assert.match(shell, /<BoardViewToggle \/>[\s\S]*<SystemActivityButton/);
    assert.match(shell, /SystemActivityPanel/);
    assert.match(button, /aria-label="לוח פעילות"/);
    assert.match(button, /system-activity-btn/);
    assert.match(panel, /ייצוא לאקסל/);
    assert.match(panel, /מתאריך/);
    assert.match(panel, /עד תאריך/);
  });
});
