import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GITHUB_OIDC_ISSUER,
  GITHUB_OIDC_REPOSITORY,
  isAllowedGitHubOidcClaims,
} from "../../../supabase/functions/_shared/github-oidc.ts";

const valid: Record<string, unknown> = {
  iss: GITHUB_OIDC_ISSUER,
  repository: GITHUB_OIDC_REPOSITORY,
  ref: "refs/heads/main",
  event_name: "push",
  job_workflow_ref:
    "erezbabayan/BabiTk/.github/workflows/deploy-supabase-functions.yml@refs/heads/main",
};

describe("GitHub OIDC deploy claims", () => {
  it("allows the production deploy workflow on main", () => {
    assert.equal(isAllowedGitHubOidcClaims(valid), true);
    assert.equal(
      isAllowedGitHubOidcClaims({ ...valid, event_name: "workflow_dispatch" }),
      true,
    );
  });

  it("rejects other repos, branches, and workflows", () => {
    assert.equal(isAllowedGitHubOidcClaims({ ...valid, repository: "other/repo" }), false);
    assert.equal(isAllowedGitHubOidcClaims({ ...valid, ref: "refs/heads/dev" }), false);
    assert.equal(isAllowedGitHubOidcClaims({ ...valid, event_name: "pull_request" }), false);
    assert.equal(
      isAllowedGitHubOidcClaims({
        ...valid,
        job_workflow_ref: "erezbabayan/BabiTk/.github/workflows/ci.yml@refs/heads/main",
      }),
      false,
    );
  });
});
