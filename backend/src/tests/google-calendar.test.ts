import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGoogleAuthUrl,
  calendarEventBody,
  createOAuthState,
  isCalendarRelevantPatch,
  parseOAuthState,
  shouldDeleteCalendarEvent,
  shouldUpsertCalendarEvent,
  withCalendarQuery,
} from "../lib/google-calendar.js";

describe("Google Calendar sync rules", () => {
  it("upserts only dated actionable tasks that are not deleted", () => {
    assert.equal(
      shouldUpsertCalendarEvent({
        title: "שיחה",
        content: "",
        is_actionable: true,
        due_date: "2026-09-18T07:00:00.000Z",
        deleted_at: null,
      }),
      true,
    );
    assert.equal(
      shouldUpsertCalendarEvent({
        title: "הערה",
        content: "בלי תאריך",
        is_actionable: false,
        due_date: "2026-09-18T07:00:00.000Z",
      }),
      false,
    );
    assert.equal(
      shouldUpsertCalendarEvent({
        title: "משימה",
        content: "",
        is_actionable: true,
        due_date: null,
      }),
      false,
    );
    assert.equal(
      shouldUpsertCalendarEvent({
        title: "משימה",
        content: "",
        is_actionable: true,
        due_date: "2026-09-18T07:00:00.000Z",
        deleted_at: "2026-09-18T08:00:00.000Z",
      }),
      false,
    );
  });

  it("deletes an existing event when the task is undated, a note, or trashed", () => {
    assert.equal(
      shouldDeleteCalendarEvent({
        title: "משימה",
        content: "",
        is_actionable: true,
        due_date: null,
        calendar_event_id: "evt_1",
      }),
      true,
    );
    assert.equal(
      shouldDeleteCalendarEvent({
        title: "משימה",
        content: "",
        is_actionable: true,
        due_date: "2026-09-18T07:00:00.000Z",
        calendar_event_id: "evt_1",
      }),
      false,
    );
  });

  it("builds a one-hour Jerusalem event", () => {
    const body = calendarEventBody({
      title: "פגישה",
      content: "עם דנה",
      due_date: "2026-09-18T07:00:00.000Z",
    });
    assert.equal(body.summary, "פגישה");
    assert.match(body.description, /BabiTk/);
    assert.equal(body.start.timeZone, "Asia/Jerusalem");
    assert.equal(
      new Date(body.end.dateTime).getTime() - new Date(body.start.dateTime).getTime(),
      60 * 60 * 1000,
    );
  });

  it("treats due_date/type/title/delete patches as calendar-relevant", () => {
    assert.equal(isCalendarRelevantPatch({ due_date: "2026-09-18T07:00:00.000Z" }), true);
    assert.equal(isCalendarRelevantPatch({ is_actionable: false }), true);
    assert.equal(isCalendarRelevantPatch({ sort_order: 10 }), false);
  });
});

describe("Google Calendar OAuth helpers", () => {
  it("builds a consent URL with calendar.events and offline access", () => {
    const url = buildGoogleAuthUrl({
      clientId: "abc.apps.googleusercontent.com",
      redirectUri: "https://example.supabase.co/functions/v1/google-calendar/callback",
      state: "user.exp.mac",
    });
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://accounts.google.com");
    assert.equal(parsed.searchParams.get("access_type"), "offline");
    assert.equal(parsed.searchParams.get("prompt"), "consent");
    assert.equal(
      parsed.searchParams.get("scope"),
      "https://www.googleapis.com/auth/calendar.events",
    );
    assert.equal(parsed.searchParams.get("state"), "user.exp.mac");
  });

  it("round-trips HMAC state and rejects tampering or expiry", async () => {
    const secret = "test-secret";
    const userId = "11111111-2222-4333-8444-555555555555";
    const now = 1_700_000_000_000;
    const state = await createOAuthState(userId, secret, now);
    assert.equal(await parseOAuthState(state, secret, now + 1000), userId);

    await assert.rejects(() => parseOAuthState(state, "other-secret", now + 1000));
    await assert.rejects(() => parseOAuthState(state.slice(0, -1) + "0", secret, now + 1000));
    await assert.rejects(() => parseOAuthState(state, secret, now + 11 * 60 * 1000));
  });

  it("appends calendar status to the app URL", () => {
    const url = withCalendarQuery("https://erezbabayan.github.io/BabiTk/", "connected");
    assert.equal(
      url,
      "https://erezbabayan.github.io/BabiTk/?calendar=connected",
    );
  });
});
