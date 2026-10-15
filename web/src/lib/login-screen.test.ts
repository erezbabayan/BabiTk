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
const googleEnable = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/GoogleOAuthEnable.tsx"),
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

  it("keeps Google login as a button without copy-paste URIs", () => {
    assert.match(loginScreen, /GoogleSignInButton/);
    assert.equal(loginScreen.includes("javascriptOrigins"), false);
    assert.equal(loginScreen.includes("CopyRow"), false);
    assert.equal(loginScreen.includes("Client ID"), false);
    assert.equal(googleEnable.includes("CopyRow"), false);
    assert.match(googleEnable, /googleOAuthSetupPublic/);
    assert.match(googleEnable, /authRedirectUri/);
    assert.match(googleEnable, /calendarRedirectUri/);
  });

  it("exposes named username and password fields so the browser can save them", () => {
    assert.match(loginScreen, /name=\{authMode === "signup" \? "email" : "username"\}/);
    assert.match(loginScreen, /name="password"/);
    assert.match(loginScreen, /autoComplete="on"/);
    assert.match(loginScreen, /שמור את ההתחברות במכשיר זה/);
  });

  it("signs new users in immediately after password signup", () => {
    const app = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
      "utf8",
    );
    assert.match(app, /signupAutoSignIn/);
    assert.match(loginScreen, /signupAutoSignIn/);
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
