import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarSettingsButtonLabel,
  formatCalendarConnectError,
  googleCalendarIdentityOptions,
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

  it("does not send users to Client ID setup copy", () => {
    const message = formatCalendarConnectError(
      new Error("Unsupported provider: provider is not enabled"),
    );
    assert.equal(message, "חיבור היומן דורש חשבון Google.");
    assert.equal(message.includes("Client ID"), false);
    assert.equal(message.includes("Google Cloud"), false);
  });
});
