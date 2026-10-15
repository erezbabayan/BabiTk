import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  hasPasswordLogin,
  isAppOwnerAccount,
  newUserProfileRow,
  preferGoogleOAuthRedirect,
} from "./auth-account.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("app owner vs regular account", () => {
  it("recognizes only the owner email and usernames", () => {
    assert.equal(isAppOwnerAccount({ email: "erezbabayan@gmail.com" }), true);
    assert.equal(isAppOwnerAccount({ email: "ErezBabayan@gmail.com" }), true);
    assert.equal(isAppOwnerAccount({ username: "erezbababan" }), true);
    assert.equal(isAppOwnerAccount({ username: "erezbabayan" }), true);
    assert.equal(
      isAppOwnerAccount({ email: "new.user@example.com", username: "guest" }),
      false,
    );
  });

  it("treats Google-only identities as accounts without a password", () => {
    assert.equal(hasPasswordLogin({ identities: [{ provider: "google" }] }), false);
    assert.equal(
      hasPasswordLogin({
        identities: [{ provider: "google" }, { provider: "email" }],
      }),
      true,
    );
    assert.equal(
      hasPasswordLogin({ app_metadata: { providers: ["email"] } }),
      true,
    );
    assert.equal(hasPasswordLogin(null), false);
  });

  it("prefers the live Auth Google redirect once the provider is on", () => {
    assert.equal(preferGoogleOAuthRedirect({ authProviderEnabled: true }), true);
    assert.equal(preferGoogleOAuthRedirect({ authProviderEnabled: false }), false);
    assert.equal(preferGoogleOAuthRedirect({}), false);
  });

  it("bootstraps a profile without overwriting a premium tier", () => {
    assert.deepEqual(newUserProfileRow("user-1", "new@example.com"), {
      id: "user-1",
      email: "new@example.com",
    });
    assert.deepEqual(newUserProfileRow("user-1", "new@example.com", "  guest  "), {
      id: "user-1",
      email: "new@example.com",
      username: "guest",
    });
    assert.equal("tier" in newUserProfileRow("user-1", "new@example.com"), false);
  });
});

describe("new-user settings stay setup-free", () => {
  it("hides Client ID paste and GitHub secrets from regular users", () => {
    const userSettings = readFileSync(join(here, "../components/UserSettings.tsx"), "utf8");
    const calendar = readFileSync(join(here, "../components/GoogleCalendarLink.tsx"), "utf8");
    const whatsapp = readFileSync(
      join(here, "../components/WhatsAppWebhookDeployBanner.tsx"),
      "utf8",
    );
    const passwordForm = readFileSync(
      join(here, "../components/ChangePasswordForm.tsx"),
      "utf8",
    );
    const googleAuth = readFileSync(join(here, "google-auth.ts"), "utf8");

    assert.match(userSettings, /canEnableGoogle \?/);
    assert.match(userSettings, /hasPasswordLogin=\{passwordLogin\}/);
    assert.equal(userSettings.includes("Client ID"), false);

    assert.match(calendar, /canConfigure && !configured/);
    assert.match(calendar, /חיבור היומן עדיין לא זמין/);
    assert.match(calendar, /הזנת יומן/);
    assert.equal(calendar.includes("Client ID"), false);
    assert.match(calendar, /disabled=\{busy \|\| !configured\}/);

    assert.match(whatsapp, /isAppOwnerAccount/);
    assert.match(whatsapp, /if \(!owner \|\| ready !== false\) return null/);

    assert.match(passwordForm, /הוסיפו סיסמה/);
    assert.match(passwordForm, /setPasswordForSignedInUser/);
    assert.match(passwordForm, /hasPasswordLogin \? null/);

    assert.match(googleAuth, /preferGoogleOAuthRedirect\(health\)/);
  });
});
