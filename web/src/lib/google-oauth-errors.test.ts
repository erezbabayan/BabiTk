import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABITK_PRIVACY_URL,
  GOOGLE_AUTH_AUDIENCE_URL,
  CALENDAR_OAUTH_INCOMPLETE_MESSAGE,
  GOOGLE_TESTING_DENIED_MESSAGE,
  calendarOauthPublishHelp,
  calendarOauthPublishLabel,
  calendarOauthPublishTitle,
  calendarPublishCaption,
  calendarTestingDeniedUserMessage,
  isGoogleOauthTestingDenied,
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
