import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatOAuthSignInError,
  GOOGLE_PROVIDER_DISABLED_MESSAGE,
} from "./auth-redirect.ts";

const loginScreen = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/LoginScreen.tsx"),
  "utf8",
);

describe("login screen stays a password login", () => {
  it("does not embed the leftover Google OAuth setup wall", () => {
    assert.equal(loginScreen.includes("GoogleLoginSetup"), false);
    assert.equal(loginScreen.includes("getGoogleCalendarHealth"), false);
    assert.equal(loginScreen.includes("Client ID"), false);
    assert.equal(loginScreen.includes("Client Secret"), false);
    assert.match(loginScreen, /סיסמה/);
    assert.match(loginScreen, /התחבר/);
  });

  it("asks for email and password when Google is not available", () => {
    assert.equal(
      formatOAuthSignInError("Unsupported provider: provider is not enabled"),
      GOOGLE_PROVIDER_DISABLED_MESSAGE,
    );
    assert.match(GOOGLE_PROVIDER_DISABLED_MESSAGE, /אימייל וסיסמה/);
    assert.equal(GOOGLE_PROVIDER_DISABLED_MESSAGE.includes("Client ID"), false);
  });
});
