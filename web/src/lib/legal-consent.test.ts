import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { SIGNUP_CONSENT_ERROR, validateSignupDetails } from "./signup-details.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), "utf8");
const base = { firstName: "ארז", lastName: "ב", phone: "0501234567", username: "erez" };

describe("signup legal consent", () => {
  it("blocks signup without accepting terms + privacy", () => {
    assert.throws(() => validateSignupDetails(base), { message: SIGNUP_CONSENT_ERROR });
    assert.doesNotThrow(() => validateSignupDetails({ ...base, acceptedLegalVersion: "2026-10-24" }));
  });

  it("login screen shows consent checkbox and policy links", () => {
    const s = read("../components/LoginScreen.tsx");
    assert.match(s, /name="acceptLegal"/);
    assert.match(s, /BABITK_PRIVACY_URL/);
    assert.match(s, /BABITK_TERMS_URL/);
    assert.match(s, /<LegalLinks/);
  });

  it("public policy pages cover required topics in Hebrew and English", () => {
    const privacy = read("../../public/privacy.html");
    for (const needle of [
      "erezbabayan@gmail.com", "Supabase", "Groq", "Gemini", "Green-API", "GitHub",
      "קטינים", "localStorage", "ייצוא", "מחיקה", 'lang="en"', "Retention",
    ]) assert.ok(privacy.includes(needle), `privacy.html missing ${needle}`);
    const terms = read("../../public/terms.html");
    assert.ok(terms.includes("privacy.html") && terms.includes('lang="en"'));
  });
});
