/** Owner login aliases → real email. Other users still sign in with their own email. */
const OWNER_EMAIL = "erezbabayan@gmail.com";

const LOGIN_ALIASES: Record<string, string> = {
  erezbababan: OWNER_EMAIL,
  erezbabayan: OWNER_EMAIL,
  "ארז": OWNER_EMAIL,
  "ארז בביאן": OWNER_EMAIL,
};

export const OWNER_DISPLAY_NAME = {
  firstName: "ארז",
  lastName: "בביאן",
} as const;

export function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  return LOGIN_ALIASES[lower] ?? LOGIN_ALIASES[trimmed] ?? lower;
}
