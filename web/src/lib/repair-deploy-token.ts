export const OWNER_REPAIR_VERSION = "owner-pat-v1";
export const SUPABASE_ACCESS_TOKEN_URL =
  "https://supabase.com/dashboard/account/tokens";

export function isSupabasePat(token: string): boolean {
  return /^sbp_[A-Za-z0-9]{20,}$/.test(token.trim());
}

export function mintReportsOwnerRepair(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { repair?: unknown }).repair === OWNER_REPAIR_VERSION;
}

export async function liveMintReportsOwnerRepair(supabaseUrl: string): Promise<boolean> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/github-oidc-mint`;
  if (!url.startsWith("https://")) return false;
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return false;
    return mintReportsOwnerRepair(await response.json());
  } catch {
    return false;
  }
}

export function repairErrorMessage(error: string | undefined): string {
  switch (error) {
    case "management_token_invalid":
    case "management_token_probe_failed":
      return "הטוקן לא תקין או שפג. צרו טוקן חדש ב-Supabase Account Tokens.";
    case "management_token_missing":
      return "הדביקו טוקן שמתחיל ב-sbp_.";
    case "owner_required":
      return "רק חשבון הבעלים יכול להפעיל את הפריסה.";
    case "invalid_oidc_token":
    case "missing_oidc_token":
      return "השרת החי עדיין לא יודע לקבל טוקן מכאן. הדביקו אותו ב-GitHub Actions → Deploy Supabase Functions → Run workflow.";
    case "secret_sync_failed":
      return "הטוקן תקין אבל עדכון הסוד בשרת נכשל. נסו שוב.";
    default:
      return "לא הצלחתי לפרוס עם הטוקן. נסו שוב או הדביקו ב-Run workflow.";
  }
}

export async function repairDeployToken(input: {
  supabaseUrl: string;
  anonKey: string;
  userAccessToken: string;
  managementToken: string;
}): Promise<{ ok: boolean; error?: string; deployed?: string[] }> {
  const managementToken = input.managementToken.trim();
  if (!isSupabasePat(managementToken)) {
    return { ok: false, error: "management_token_missing" };
  }
  const url = `${input.supabaseUrl.replace(/\/$/, "")}/functions/v1/github-oidc-mint`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.userAccessToken}`,
      apikey: input.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: managementToken }),
  });
  const body: unknown = await response.json().catch(() => null);
  const error =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : undefined;
  if (!response.ok) {
    return { ok: false, error: error ?? "repair_failed" };
  }
  const deployed =
    body && typeof body === "object" && Array.isArray((body as { deployed?: unknown }).deployed)
      ? ((body as { deployed: unknown[] }).deployed.filter(
          (item): item is string => typeof item === "string",
        ))
      : [];
  return { ok: true, deployed };
}
