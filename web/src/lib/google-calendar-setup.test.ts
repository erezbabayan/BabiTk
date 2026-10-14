import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  googleCalendarHealthFromUnknown,
  googleLoginReady,
  googleOAuthSetupPublic,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
} from "./google-calendar-setup.ts";

describe("Google Calendar OAuth setup", () => {
  it("lists the Pages origin and both Supabase redirect URIs", () => {
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
    assert.equal(setup.scope, "https://www.googleapis.com/auth/calendar.events");
  });

  it("treats missing health fields as not configured, with fallback URIs", () => {
    const health = googleCalendarHealthFromUnknown({ ok: true });
    assert.equal(health.configured, false);
    assert.equal(health.authProviderEnabled, false);
    assert.equal(health.googleClientId, null);
    assert.equal(
      health.authRedirectUri,
      "https://ghibfuinantybqidwadj.supabase.co/auth/v1/callback",
    );
    assert.equal(
      health.calendarRedirectUri,
      "https://ghibfuinantybqidwadj.supabase.co/functions/v1/google-calendar/callback",
    );
  });

  it("accepts real Google OAuth client values and rejects placeholders", () => {
    assert.equal(looksLikeGoogleClientId("123-abc.apps.googleusercontent.com"), true);
    assert.equal(looksLikeGoogleClientId("YOUR_ID.apps.googleusercontent.com"), false);
    assert.equal(looksLikeGoogleClientId("not-a-client"), false);
    assert.equal(looksLikeGoogleClientSecret("GOCSPX-real-secret-value"), true);
    assert.equal(looksLikeGoogleClientSecret("GOCSPX-..."), false);
    assert.equal(looksLikeGoogleClientSecret("short"), false);
  });

  it("keeps a live configured=true health payload", () => {
    const health = googleCalendarHealthFromUnknown({
      configured: true,
      authProviderEnabled: true,
      googleClientId: "123-abc.apps.googleusercontent.com",
      authRedirectUri: "https://example.supabase.co/auth/v1/callback",
      calendarRedirectUri: "https://example.supabase.co/functions/v1/google-calendar/callback",
      javascriptOrigins: ["https://erezbabayan.github.io"],
      scope: "https://www.googleapis.com/auth/calendar.events",
    });
    assert.equal(health.configured, true);
    assert.equal(health.authProviderEnabled, true);
    assert.equal(health.googleClientId, "123-abc.apps.googleusercontent.com");
    assert.deepEqual(health.javascriptOrigins, ["https://erezbabayan.github.io"]);
    assert.equal(googleLoginReady(health), true);
    assert.equal(
      googleLoginReady({ authProviderEnabled: false, googleClientId: null }),
      false,
    );
  });
});
