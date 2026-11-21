const FALLBACK_TIMEZONE = "Asia/Jerusalem";
const FALLBACK_LOCALE = "he-IL";

/** IANA names like Asia/Jerusalem, America/Argentina/Buenos_Aires, or UTC. */
const IANA_TIMEZONE_RE = /^(?:UTC|GMT|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/;

/** BCP-47-like language or language-region, e.g. he, he-IL, en-US. */
const LOCALE_RE = /^([a-z]{2,3})(?:-([a-z]{2}))?$/i;

export function sanitizeParseTimezone(value: string | undefined | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 64 || !IANA_TIMEZONE_RE.test(raw)) {
    return FALLBACK_TIMEZONE;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function sanitizeParseLocale(value: string | undefined | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 8) {
    return FALLBACK_LOCALE;
  }
  const match = raw.match(LOCALE_RE);
  if (!match) {
    return FALLBACK_LOCALE;
  }
  const language = match[1]!.toLowerCase();
  const region = match[2] ? match[2].toUpperCase() : null;
  return region ? `${language}-${region}` : language;
}
