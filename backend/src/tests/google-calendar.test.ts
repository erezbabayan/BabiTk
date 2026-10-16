import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCalendarIcs,
  buildGoogleAuthUrl,
  calendarEventBody,
  calendarEventRecurrence,
  calendarFeedToken,
  calendarFeedTokenValid,
  calendarIcsFeedUrl,
  createOAuthState,
  googleCalendarSubscribeUrl,
  icsRruleLine,
  parseCalendarIcsRequest,
  googleCalendarLinkState,
  googleOAuthSetupPublic,
  icsUtcStamp,
  isCalendarRelevantPatch,
  isGoogleOAuthOwner,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
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
    assert.equal(body.recurrence, undefined);
    const repeating = calendarEventBody({
      title: "תרופה",
      content: "",
      due_date: "2026-09-18T07:00:00.000Z",
      recurrence: "weekdays",
    });
    assert.deepEqual(repeating.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH"]);
  });

  it("treats due_date/type/title/delete patches as calendar-relevant", () => {
    assert.equal(isCalendarRelevantPatch({ due_date: "2026-09-18T07:00:00.000Z" }), true);
    assert.equal(isCalendarRelevantPatch({ is_actionable: false }), true);
    assert.equal(isCalendarRelevantPatch({ sort_order: 10 }), false);
  });
});

describe("Google Calendar OAuth helpers", () => {
  it("builds a consent URL with calendar.events, offline access, and login_hint", () => {
    const url = buildGoogleAuthUrl({
      clientId: "abc.apps.googleusercontent.com",
      redirectUri: "https://example.supabase.co/functions/v1/google-calendar/callback",
      state: "user.exp.mac",
      loginHint: "erezbabayan@gmail.com",
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
    assert.equal(parsed.searchParams.get("login_hint"), "erezbabayan@gmail.com");
  });

  it("treats ICS-only rows as disconnected until Google OAuth writes a refresh token", () => {
    assert.deepEqual(
      googleCalendarLinkState({
        enabled: true,
        refreshToken: null,
        oauthConfigured: true,
      }),
      {
        linked: false,
        writable: false,
        configured: true,
        oauthConfigured: true,
      },
    );
    assert.deepEqual(
      googleCalendarLinkState({
        enabled: true,
        refreshToken: "calendar-refresh-token-value",
        oauthConfigured: true,
      }),
      {
        linked: true,
        writable: true,
        configured: true,
        oauthConfigured: true,
      },
    );
    assert.equal(
      googleCalendarLinkState({
        enabled: false,
        refreshToken: "",
        oauthConfigured: false,
      }).configured,
      false,
    );
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
    const failed = withCalendarQuery("https://erezbabayan.github.io/BabiTk/", "error", {
      error: "access_denied",
      description: "access_denied:403",
    });
    const parsed = new URL(failed);
    assert.equal(parsed.searchParams.get("calendar"), "error");
    assert.equal(parsed.searchParams.get("error"), "access_denied");
    assert.equal(parsed.searchParams.get("error_description"), "access_denied:403");
  });

  it("recognizes the owner and real Google OAuth client values", () => {
    assert.equal(isGoogleOAuthOwner({ email: "erezbabayan@gmail.com" }), true);
    assert.equal(isGoogleOAuthOwner({ username: "erezbababan" }), true);
    assert.equal(isGoogleOAuthOwner({ email: "other@example.com", username: "guest" }), false);
    assert.equal(looksLikeGoogleClientId("123-abc.apps.googleusercontent.com"), true);
    assert.equal(looksLikeGoogleClientId("YOUR_ID.apps.googleusercontent.com"), false);
    assert.equal(looksLikeGoogleClientSecret("GOCSPX-real-secret-value"), true);
    assert.equal(looksLikeGoogleClientSecret("GOCSPX-..."), false);
  });

  it("builds an ICS feed Google Calendar can subscribe to without OAuth", async () => {
    const ics = buildCalendarIcs([
      {
        id: "item-1",
        title: "פגישה; דחוף",
        content: "עם דנה",
        due_date: "2026-09-18T07:00:00.000Z",
      },
    ]);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /X-WR-CALNAME:BabiTk/);
    assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT15M/);
    assert.match(ics, /SUMMARY:פגישה\\; דחוף/);
    assert.match(ics, /DTSTART:20260918T070000Z/);
    assert.equal(/RRULE:/.test(ics), false);

    const recurring = buildCalendarIcs([
      {
        id: "item-2",
        title: "תרופה",
        content: "",
        due_date: "2026-09-18T07:00:00.000Z",
        recurrence: "daily",
      },
      {
        id: "item-3",
        title: "ימי חול",
        content: "",
        due_date: "2026-09-18T07:00:00.000Z",
        recurrence: "weekdays",
      },
    ]);
    assert.match(recurring, /RRULE:FREQ=DAILY/);
    assert.match(recurring, /RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH/);
    assert.equal(icsRruleLine("weekly"), "RRULE:FREQ=WEEKLY");
    assert.equal(icsRruleLine("monthly"), "RRULE:FREQ=MONTHLY");
    assert.equal(calendarEventRecurrence({ reminder_recurrence: "daily" }), "daily");
    assert.equal(calendarEventRecurrence({}), null);
    assert.equal(icsUtcStamp("2026-09-18T07:00:00.000Z"), "20260918T070000Z");
    const token = await calendarFeedToken("user-1", "secret");
    assert.equal(await calendarFeedTokenValid("user-1", token, "secret"), true);
    assert.equal(await calendarFeedTokenValid("user-2", token, "secret"), false);
    const feed = calendarIcsFeedUrl(
      "https://ghibfuinantybqidwadj.supabase.co",
      "user-1",
      token,
    );
    assert.match(feed, /\/google-calendar\/ics\//);
    assert.equal(feed.includes("?"), false);
    const parsed = parseCalendarIcsRequest(new URL(feed).pathname, new URL(feed).searchParams);
    assert.equal(parsed.userId, "user-1");
    assert.equal(parsed.token, token);
    const subscribe = googleCalendarSubscribeUrl(feed);
    assert.equal(new URL(subscribe).hostname, "calendar.google.com");
    assert.equal(new URL(subscribe).searchParams.get("cid"), feed);
    assert.equal(new URL(subscribe).searchParams.get("cid")?.startsWith("https://"), true);
    const fromWebcal = googleCalendarSubscribeUrl(
      "webcal://ghibfuinantybqidwadj.supabase.co/functions/v1/google-calendar/ics/user-1/token",
    );
    assert.equal(
      new URL(fromWebcal).searchParams.get("cid"),
      "https://ghibfuinantybqidwadj.supabase.co/functions/v1/google-calendar/ics/user-1/token",
    );
  });

  it("exposes the live Google Cloud redirect URIs", () => {
    const setup = googleOAuthSetupPublic();
    assert.deepEqual(setup.javascriptOrigins, [
      "https://erezbabayan.github.io",
      "http://localhost:5173",
    ]);
    assert.equal(
      setup.authRedirectUri,
      "https://ghibfuinantybqidwadj.supabase.co/auth/v1/callback",
    );
    assert.equal(
      setup.calendarRedirectUri,
      "https://ghibfuinantybqidwadj.supabase.co/functions/v1/google-calendar/callback",
    );
  });
});
