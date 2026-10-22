/** Owner login aliases → real email. Keep in sync with web/src/lib/login-aliases.ts. */
export const OWNER_EMAIL = "erezbabayan@gmail.com";

const LOGIN_ALIASES: Record<string, string> = {
  erezbababan: OWNER_EMAIL,
  erezbabayan: OWNER_EMAIL,
  "ארז": OWNER_EMAIL,
  "ארז בביאן": OWNER_EMAIL,
};

export function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  return LOGIN_ALIASES[lower] ?? LOGIN_ALIASES[trimmed] ?? lower;
}

export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}
