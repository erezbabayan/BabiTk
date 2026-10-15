const APP_OWNER_EMAILS = ["erezbabayan@gmail.com"] as const;
const APP_OWNER_USERNAMES = ["erezbabayan", "erezbababan"] as const;

export type AuthProviderHint = {
  identities?: Array<{ provider?: string }> | null;
  app_metadata?: { providers?: string[] } | null;
};

export function isAppOwnerAccount(input: {
  email?: string | null;
  username?: string | null;
}): boolean {
  const email = (input.email ?? "").trim().toLowerCase();
  if ((APP_OWNER_EMAILS as readonly string[]).includes(email)) return true;
  const username = (input.username ?? "").trim().toLowerCase();
  return (APP_OWNER_USERNAMES as readonly string[]).includes(username);
}

function providerList(user: AuthProviderHint | null | undefined): string[] {
  const fromIdentities = (user?.identities ?? [])
    .map((item) => item.provider?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  const fromMetadata = (user?.app_metadata?.providers ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...fromIdentities, ...fromMetadata];
}

/** True when the account can sign in with email+password (not Google-only). */
export function hasPasswordLogin(user: AuthProviderHint | null | undefined): boolean {
  return providerList(user).includes("email");
}

export function preferGoogleOAuthRedirect(health: {
  authProviderEnabled?: boolean | null;
}): boolean {
  return health.authProviderEnabled === true;
}

/** Own free-tier profile fields. Omit `tier` so an upsert cannot downgrade premium. */
export function newUserProfileRow(
  userId: string,
  email: string,
  username?: string | null,
): {
  id: string;
  email: string;
  username?: string;
} {
  const row: { id: string; email: string; username?: string } = { id: userId, email };
  const trimmed = username?.trim();
  if (trimmed) row.username = trimmed;
  return row;
}
