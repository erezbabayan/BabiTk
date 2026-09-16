/** Project owner accounts that always keep a Premium subscription. */

export const OWNER_EMAIL = "erezbabayan@gmail.com";

const OWNER_USERNAMES = new Set(["erezbababan", "erezbabayan"]);

export function isOwnerAccount(input: {
  email?: string | null;
  username?: string | null;
}): boolean {
  const email = input.email?.trim().toLowerCase() ?? "";
  if (email === OWNER_EMAIL) return true;

  const username = input.username?.trim().toLowerCase() ?? "";
  return OWNER_USERNAMES.has(username);
}
