export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const DEFAULT_SUPABASE_URL = "https://ghibfuinantybqidwadj.supabase.co";
export const GOOGLE_OAUTH_JAVASCRIPT_ORIGINS = [
  "https://erezbabayan.github.io",
  "http://localhost:5173",
] as const;

export type GoogleCalendarSetup = {
  javascriptOrigins: string[];
  authRedirectUri: string;
  calendarRedirectUri: string;
  scope: string;
};

export function googleOAuthSetupPublic(
  supabaseUrl = DEFAULT_SUPABASE_URL,
): GoogleCalendarSetup {
  const base = supabaseUrl.replace(/\/$/, "") || DEFAULT_SUPABASE_URL;
  return {
    javascriptOrigins: [...GOOGLE_OAUTH_JAVASCRIPT_ORIGINS],
    authRedirectUri: `${base}/auth/v1/callback`,
    calendarRedirectUri: `${base}/functions/v1/google-calendar/callback`,
    scope: GOOGLE_CALENDAR_SCOPE,
  };
}

export type GoogleCalendarHealth = {
  configured: boolean;
  authProviderEnabled: boolean;
  redirectUri: string;
  authRedirectUri: string;
  calendarRedirectUri: string;
  javascriptOrigins: string[];
  scope: string;
};

export function googleCalendarHealthFromUnknown(
  data: unknown,
  supabaseUrl = DEFAULT_SUPABASE_URL,
): GoogleCalendarHealth {
  const setup = googleOAuthSetupPublic(supabaseUrl);
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const origins = Array.isArray(record.javascriptOrigins)
    ? record.javascriptOrigins.filter((item): item is string => typeof item === "string")
    : setup.javascriptOrigins;
  return {
    configured: record.configured === true,
    authProviderEnabled: record.authProviderEnabled === true,
    redirectUri:
      typeof record.redirectUri === "string" && record.redirectUri
        ? record.redirectUri
        : setup.calendarRedirectUri,
    authRedirectUri:
      typeof record.authRedirectUri === "string" && record.authRedirectUri
        ? record.authRedirectUri
        : setup.authRedirectUri,
    calendarRedirectUri:
      typeof record.calendarRedirectUri === "string" && record.calendarRedirectUri
        ? record.calendarRedirectUri
        : setup.calendarRedirectUri,
    javascriptOrigins: origins.length > 0 ? origins : setup.javascriptOrigins,
    scope: typeof record.scope === "string" && record.scope ? record.scope : setup.scope,
  };
}
