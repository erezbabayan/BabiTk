/** Supabase Management API token helpers used by mint + owner repair. */

export const SUPABASE_PROJECT_REF = "ghibfuinantybqidwadj";

export const SUPABASE_MANAGEMENT_PROJECT_URL =
  `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}`;

export const DEPLOY_OWNER_EMAILS = ["erezbabayan@gmail.com"] as const;
export const DEPLOY_OWNER_USERNAMES = ["erezbabayan", "erezbababan"] as const;

export const OWNER_REPAIR_VERSION = "owner-pat-v1";

export function isSupabasePat(token: string): boolean {
  return /^sbp_[A-Za-z0-9]{20,}$/.test(token.trim());
}

export function isDeployOwner(input: {
  email?: string | null;
  username?: string | null;
}): boolean {
  const email = (input.email ?? "").trim().toLowerCase();
  if ((DEPLOY_OWNER_EMAILS as readonly string[]).includes(email)) return true;
  const username = (input.username ?? "").trim().toLowerCase();
  return (DEPLOY_OWNER_USERNAMES as readonly string[]).includes(username);
}

export function managementTokenError(status: number): string {
  if (status === 401 || status === 403) return "management_token_invalid";
  return "management_token_probe_failed";
}

export async function probeManagementToken(token: string): Promise<number> {
  const trimmed = token.trim();
  if (!isSupabasePat(trimmed)) return 401;
  const response = await fetch(SUPABASE_MANAGEMENT_PROJECT_URL, {
    headers: {
      Authorization: `Bearer ${trimmed}`,
      apikey: trimmed,
    },
  });
  return response.status;
}

export function readRepairAccessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const token = (body as { access_token?: unknown }).access_token;
  return typeof token === "string" ? token.trim() : "";
}
