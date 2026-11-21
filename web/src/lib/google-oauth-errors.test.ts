import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABITK_PRIVACY_URL,
  GOOGLE_AUTH_AUDIENCE_URL,
  CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE,
  CALENDAR_OAUTH_GENERIC_MESSAGE,
  CALENDAR_OAUTH_INCOMPLETE_MESSAGE,
  GOOGLE_TESTING_DENIED_MESSAGE,
  calendarOauthErrorMessage,
  calendarOauthPublishHelp,
  calendarOauthPublishLabel,
  calendarOauthPublishTitle,
  calendarPublishCaption,
  calendarTestingDeniedUserMessage,
  classifyCalendarOauthError,
  isGoogleOauthTestingDenied,
  messageForStoredCalendarOauthError,
  storeCalendarOauthErrorCode,
  CALENDAR_OAUTH_ERROR_KEY,
} from "./google-oauth-errors.ts";

describe("Google OAuth testing-mode 403", () => {
  it("matches the Hebrew Access blocked calendar screenshot", () => {
    assert.equal(
      isGoogleOauthTestingDenied(
        "access_denied:403",
        "הגישה חסומה: תהליך האימות של Google לאפליקציה לא הושלם. האפליקציה נמצאת כרגע בבדיקה, ורק בודקים שאושרו על ידי המפתח יכולים לגשת אליה.",
      ),
      true,
    );
    assert.equal(isGoogleOauthTestingDenied("access_denied"), false);
    assert.match(GOOGLE_TESTING_DENIED_MESSAGE, /יומן הראשי/);
    assert.match(GOOGLE_TESTING_DENIED_MESSAGE, /במערכת/);
    assert.match(GOOGLE_AUTH_AUDIENCE_URL, /auth\/audience\?project=babaitk/);
    assert.match(BABITK_PRIVACY_URL, /privacy\.html/);
    assert.equal(calendarOauthPublishTitle(), "פרסם ב-Google");
    assert.match(calendarOauthPublishLabel(), /מחשב/);
    assert.match(calendarOauthPublishHelp(), /Publish app/);
    assert.match(calendarOauthPublishHelp(), /יומן הראשי/);
    assert.match(calendarOauthPublishHelp(), /לא מפרסם מהטלפון/);
    assert.match(calendarPublishCaption(), /מחשב/);
    assert.equal(calendarOauthPublishHelp().includes("Client ID"), false);
    assert.match(calendarTestingDeniedUserMessage(), /יומן BabiTk/);
    assert.match(GOOGLE_TESTING_DENIED_MESSAGE, /חסם/);
    assert.match(CALENDAR_OAUTH_INCOMPLETE_MESSAGE, /Google חסם/);
  });
});

describe("calendar OAuth session error codes", () => {
  it("classifies testing, cancelled, and generic failures", () => {
    assert.equal(
      classifyCalendarOauthError(
        "access_denied:403",
        "הגישה חסומה: תהליך האימות של Google לאפליקציה לא הושלם.",
      ),
      "testing_denied",
    );
    assert.equal(classifyCalendarOauthError("access_denied"), "access_denied");
    assert.equal(classifyCalendarOauthError("user denied"), "access_denied");
    assert.equal(classifyCalendarOauthError("missing_refresh_token"), "generic");
  });

  it("maps codes to the existing Hebrew messages", () => {
    assert.equal(
      calendarOauthErrorMessage("testing_denied"),
      GOOGLE_TESTING_DENIED_MESSAGE,
    );
    assert.equal(
      calendarOauthErrorMessage("access_denied"),
      CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE,
    );
    assert.equal(
      calendarOauthErrorMessage("generic"),
      CALENDAR_OAUTH_GENERIC_MESSAGE,
    );
    assert.match(CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE, /בוטלה/);
    assert.match(CALENDAR_OAUTH_GENERIC_MESSAGE, /לא ניתן לחבר את היומן/);
  });

  it("never surfaces a raw OAuth description from sessionStorage", () => {
    assert.equal(
      messageForStoredCalendarOauthError("testing_denied"),
      GOOGLE_TESTING_DENIED_MESSAGE,
    );
    assert.equal(
      messageForStoredCalendarOauthError(
        "access_denied: secret-token-should-not-appear",
      ),
      CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE,
    );
    assert.equal(
      messageForStoredCalendarOauthError("not a known code"),
      CALENDAR_OAUTH_GENERIC_MESSAGE,
    );
  });

  it("stores only fixed codes, never the raw classifier input", () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem(k: string) {
          return memory.get(k) ?? null;
        },
        setItem(k: string, v: string) {
          memory.set(k, String(v));
        },
        removeItem(k: string) {
          memory.delete(k);
        },
      },
    });
    const key = CALENDAR_OAUTH_ERROR_KEY;
    sessionStorage.removeItem(key);
    storeCalendarOauthErrorCode(
      classifyCalendarOauthError(
        "access_denied",
        "raw-description-must-not-be-stored",
      ),
    );
    assert.equal(sessionStorage.getItem(key), "access_denied");
    assert.equal(
      (sessionStorage.getItem(key) ?? "").includes("raw-description-must-not-be-stored"),
      false,
    );
    storeCalendarOauthErrorCode(
      classifyCalendarOauthError(
        "access_denied:403",
        "הגישה חסומה: תהליך האימות של Google לאפליקציה לא הושלם.",
      ),
    );
    assert.equal(sessionStorage.getItem(key), "testing_denied");
    storeCalendarOauthErrorCode(classifyCalendarOauthError("missing_refresh_token"));
    assert.equal(sessionStorage.getItem(key), "generic");
  });
});
