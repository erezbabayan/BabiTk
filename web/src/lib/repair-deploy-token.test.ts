import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isDeployOwner,
  isSupabasePat as isSharedSupabasePat,
} from "../../../supabase/functions/_shared/management-token.ts";
import {
  isSupabasePat,
  mintReportsOwnerRepair,
  repairErrorMessage,
} from "./repair-deploy-token.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("isSupabasePat", () => {
  it("accepts a full sbp_ token and rejects empty or short values", () => {
    const sample = "sbp_" + "0".repeat(40);
    assert.equal(isSupabasePat(sample), true);
    assert.equal(isSharedSupabasePat(sample), true);
    assert.equal(isSupabasePat(`  ${sample}  `), true);
    assert.equal(isSupabasePat(""), false);
    assert.equal(isSupabasePat("sbp_short"), false);
    assert.equal(isSupabasePat("GOCSPX-not-a-supabase-token"), false);
    assert.equal(isDeployOwner({ email: "erezbabayan@gmail.com" }), true);
    assert.equal(isDeployOwner({ username: "erezbababan" }), true);
    assert.equal(isDeployOwner({ email: "other@example.com" }), false);
  });
});

describe("mintReportsOwnerRepair", () => {
  it("requires the owner-pat repair version", () => {
    assert.equal(mintReportsOwnerRepair({ ok: true, endpoint: "github-oidc-mint" }), false);
    assert.equal(
      mintReportsOwnerRepair({
        ok: true,
        endpoint: "github-oidc-mint",
        repair: "owner-pat-v1",
      }),
      true,
    );
  });
});

describe("repairErrorMessage", () => {
  it("points stale mint at Run workflow instead of GitHub secrets", () => {
    assert.match(repairErrorMessage("invalid_oidc_token"), /Run workflow/);
    assert.match(repairErrorMessage("management_token_invalid"), /Account Tokens/);
  });
});

describe("functions deploy token resolution", () => {
  it("probes a dispatch paste before the stored GitHub secret", () => {
    const yml = readFileSync(
      join(repoRoot, ".github/workflows/deploy-supabase-functions.yml"),
      "utf8",
    );
    const dispatchAt = yml.indexOf("dispatch token probe");
    const storedAt = yml.indexOf("stored token probe");
    assert.notEqual(dispatchAt, -1);
    assert.notEqual(storedAt, -1);
    assert.equal(dispatchAt < storedAt, true);
    assert.match(yml, /BABITK_MANAGEMENT_TOKEN=\$\{SUPABASE_ACCESS_TOKEN\}/);
  });

  it("mint probes the stored PAT before handing it to CI", () => {
    const mint = readFileSync(
      join(repoRoot, "supabase/functions/github-oidc-mint/index.ts"),
      "utf8",
    );
    assert.match(mint, /probeManagementToken/);
    assert.match(mint, /OWNER_REPAIR_VERSION/);
    assert.match(mint, /repairFromOwner/);
  });
});
