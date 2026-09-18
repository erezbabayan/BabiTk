import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ONBOARDING_SKIPPED_SETTINGS,
  ONBOARDING_STEPS,
  isOnboardingSettingsSection,
  onboardingSettingsSections,
} from "./onboarding-steps.ts";

const SETTINGS_MENU_IDS = [
  "user",
  "notifications",
  "whatsapp",
  "voice",
  "notebook",
  "text",
  "calendar",
  "premium",
  "tags",
  "boards",
  "trash",
] as const;

describe("first-login onboarding steps", () => {
  it("covers the general settings that remain editable later", () => {
    const sections = onboardingSettingsSections();
    assert.deepEqual(sections, [
      "notifications",
      "whatsapp",
      "voice",
      "notebook",
      "text",
      "boards",
      "calendar",
    ]);
    for (const section of sections) {
      assert.equal(SETTINGS_MENU_IDS.includes(section), true);
      assert.equal(isOnboardingSettingsSection(section), true);
    }
  });

  it("skips account-danger and admin settings", () => {
    for (const skipped of ONBOARDING_SKIPPED_SETTINGS) {
      assert.equal(onboardingSettingsSections().includes(skipped), false);
      assert.equal(isOnboardingSettingsSection(skipped), false);
    }
  });

  it("starts with a welcome questionnaire and ends at calendar", () => {
    assert.equal(ONBOARDING_STEPS[0]?.id, "welcome");
    assert.equal(ONBOARDING_STEPS[0]?.settingsSection, null);
    assert.equal(ONBOARDING_STEPS.at(-1)?.id, "calendar");
    assert.ok(ONBOARDING_STEPS[0]?.body.includes("הגדרות"));
  });
});
