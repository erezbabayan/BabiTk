import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("new user profile bootstrap", () => {
  it("bootstraps a missing profile from Settings and from password signup", () => {
    const profile = readFileSync(join(here, "user-profile.ts"), "utf8");
    const app = readFileSync(join(here, "../App.tsx"), "utf8");
    const migration = readFileSync(
      join(here, "../../../supabase/migrations/20261015120000_new_user_profile_bootstrap.sql"),
      "utf8",
    );
    const authConfig = readFileSync(
      join(here, "../../../scripts/configure-supabase-auth.mjs"),
      "utf8",
    );

    assert.match(profile, /export async function ensureOwnUserProfile/);
    assert.match(profile, /upsert\(newUserProfileRow/);
    assert.match(app, /ensureOwnUserProfile/);
    assert.match(app, /signupAutoSignIn/);
    assert.match(migration, /Users can insert own profile/);
    assert.match(migration, /auth\.uid\(\) = id/);
    assert.match(migration, /tier = 'free'/);
    assert.match(migration, /handle_new_user/);
    assert.match(authConfig, /disable_signup: false/);
    assert.match(authConfig, /mailer_autoconfirm: true/);
  });
});
