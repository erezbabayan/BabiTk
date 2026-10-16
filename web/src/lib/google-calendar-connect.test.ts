import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarLinkedHelpText,
  calendarSettingsButtonLabel,
  calendarUnlinkedHelpText,
  formatCalendarConnectError,
  GOOGLE_AUTH_AUDIENCE_URL,
  googleCalendarIdentityOptions,
  isGoogleCalendarNotConfiguredError,
  isGoogleOauthTestingDenied,
  planGoogleCalendarConnect,
  sessionHasGoogleIdentity,
} from "./google-calendar-connect.ts";

describe("simple Google Calendar connect", () => {
  it("asks Google for calendar scope on the signed-in user", () => {
    const spec = googleCalendarIdentityOptions("https://erezbabayan.github.io/BabiTk/");
    assert.equal(spec.provider, "google");
    assert.equal(spec.options.redirectTo, "https://erezbabayan.github.io/BabiTk/");
    assert.match(spec.options.scopes, /calendar\.events/);
    assert.equal(spec.options.queryParams.access_type, "offline");
    assert.equal(spec.options.queryParams.prompt, "consent");
  });

  it("detects an existing Google identity", () => {
    assert.equal(sessionHasGoogleIdentity([{ provider: "email" }]), false);
    assert.equal(
      sessionHasGoogleIdentity([{ provider: "email" }, { provider: "google" }]),
      true,
    );
  });

  it("keeps settings as connect or disconnect only", () => {
    assert.equal(calendarSettingsButtonLabel(false, false), "חבר");
    assert.equal(calendarSettingsButtonLabel(true, false), "בטל חיבור");
    assert.equal(calendarSettingsButtonLabel(false, true), "מתחבר...");
    assert.equal(calendarSettingsButtonLabel(true, true), "מנתק...");
  });

  it("prefers OAuth write to the primary calendar over an ICS subscribe dialog", () => {
    assert.deepEqual(
      planGoogleCalendarConnect({ url: "https://accounts.google.com/o/oauth2/v2/auth" }, null),
      { kind: "oauth", url: "https://accounts.google.com/o/oauth2/v2/auth" },
    );
    const notConfigured = new Error("google_not_configured");
    notConfigured.name = "google_not_configured";
    assert.equal(isGoogleCalendarNotConfiguredError(notConfigured), true);
    assert.deepEqual(planGoogleCalendarConnect(null, notConfigured), { kind: "ics" });
    const denied = new Error("access_denied:403");
    assert.deepEqual(planGoogleCalendarConnect(null, denied), { kind: "error", error: denied });
  });

  it("uses one Connect button for the in-app calendar and Google primary", () => {
    assert.match(calendarUnlinkedHelpText(), /«חבר»/);
    assert.match(calendarUnlinkedHelpText(), /יומן BabiTk במערכת/);
    assert.match(calendarUnlinkedHelpText(), /יומן Google הראשי/);
    assert.match(
      calendarLinkedHelpText({ writable: false, eventCount: 34 }),
      /לחצו «חבר»/,
    );
    assert.equal(
      calendarLinkedHelpText({ writable: true, eventCount: 34 }),
      "34 משימות עם תאריך מופיעות ביומן BabiTk ונכתבות ליומן Google הראשי.",
    );
    assert.match(calendarLinkedHelpText({ writable: true, eventCount: 0 }), /בשניהם/);
    assert.equal(calendarUnlinkedHelpText().includes("Client ID"), false);
  });

  it("does not send users to Client ID setup copy", () => {
    const message = formatCalendarConnectError(
      new Error("Unsupported provider: provider is not enabled"),
    );
    assert.equal(message, "חיבור היומן דורש חשבון Google.");
    assert.equal(message.includes("Client ID"), false);
    assert.equal(message.includes("Google Cloud"), false);
    assert.equal(
      formatCalendarConnectError(new Error("google_not_configured")),
      "חיבור ליומן Google הראשי עדיין לא זמין.",
    );
    assert.equal(
      formatCalendarConnectError(new Error("לא התקבלה כתובת חיבור ליומן")),
      "לא התקבלה כתובת חיבור ליומן",
    );
  });

  it("maps Google testing-mode 403 to a publish step, not Client ID paste", () => {
    assert.equal(
      isGoogleOauthTestingDenied("access_denied:403", "הגישה חסומה תהליך האימות לא הושלם"),
      true,
    );
    assert.equal(isGoogleOauthTestingDenied("access_denied"), false);
    const message = formatCalendarConnectError(new Error("access_denied:403"));
    assert.match(message, /יומן הראשי/);
    assert.match(message, /במערכת/);
    assert.equal(message.includes("Client ID"), false);
    assert.match(GOOGLE_AUTH_AUDIENCE_URL, /auth\/audience\?project=babaitk/);
  });
});
