/** Allowed GitHub Actions OIDC claims for minting a Supabase deploy token.
 * Keep in sync with supabase/functions/_shared/github-oidc.ts
 */

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GITHUB_OIDC_AUDIENCE = "babitk-github-oidc";
export const GITHUB_OIDC_REPOSITORY = "erezbabayan/BabiTk";
export const GITHUB_OIDC_REF = "refs/heads/main";
export const GITHUB_OIDC_WORKFLOWS = [
  "erezbabayan/BabiTk/.github/workflows/deploy-supabase-functions.yml",
  "erezbabayan/BabiTk/.github/workflows/deploy-web.yml",
] as const;

export function isAllowedGitHubOidcClaims(payload: Record<string, unknown>): boolean {
  if (payload.iss !== GITHUB_OIDC_ISSUER) return false;
  if (payload.repository !== GITHUB_OIDC_REPOSITORY) return false;
  if (payload.ref !== GITHUB_OIDC_REF) return false;
  const event = payload.event_name;
  if (event !== "push" && event !== "workflow_dispatch") return false;
  const workflow = String(payload.job_workflow_ref ?? payload.workflow_ref ?? "");
  return GITHUB_OIDC_WORKFLOWS.some((allowed) => workflow.includes(allowed));
}
