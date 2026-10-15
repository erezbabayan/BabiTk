import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABITK_PRIVACY_URL,
  GOOGLE_AUTH_AUDIENCE_URL,
  GOOGLE_TESTING_DENIED_MESSAGE,
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
    assert.match(GOOGLE_TESTING_DENIED_MESSAGE, /מצב בדיקות/);
    assert.match(GOOGLE_AUTH_AUDIENCE_URL, /auth\/audience\?project=babaitk/);
    assert.match(BABITK_PRIVACY_URL, /privacy\.html/);
  });
});
