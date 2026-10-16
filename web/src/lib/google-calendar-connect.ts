import {
  GOOGLE_TESTING_DENIED_MESSAGE,
  isGoogleOauthTestingDenied,
} from "./google-oauth-errors.ts";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export {
  BABITK_PRIVACY_URL,
  CALENDAR_OAUTH_INCOMPLETE_MESSAGE,
  GOOGLE_AUTH_AUDIENCE_URL,
  GOOGLE_TESTING_DENIED_MESSAGE,
  calendarOauthPublishHelp,
  calendarOauthPublishLabel,
  calendarTestingDeniedUserMessage,
  isGoogleOauthTestingDenied,
} from "./google-oauth-errors.ts";

export function googleCalendarIdentityOptions(redirectTo: string): {
  provider: "google";
  options: {
    redirectTo: string;
    scopes: string;
    queryParams: {
      access_type: "offline";
      prompt: "consent";
      include_granted_scopes: string;
    };
  };
} {
  return {
    provider: "google",
    options: {
      redirectTo,
      scopes: `${GOOGLE_CALENDAR_SCOPE} email profile openid`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  };
}

export function sessionHasGoogleIdentity(
  identities: Array<{ provider?: string }> | undefined,
): boolean {
  return (identities ?? []).some((item) => item.provider === "google");
}

export function isGoogleCalendarNotConfiguredError(error: unknown): boolean {
  const err = error instanceof Error ? error : null;
  const message = err?.message ?? String(error ?? "");
  const name = err?.name ?? "";
  return (
    name === "google_not_configured" ||
    message === "google_not_configured" ||
    message.includes("עדיין לא הוגדר")
  );
}

export type GoogleCalendarConnectPlan =
  | { kind: "oauth"; url: string }
  | { kind: "ics" }
  | { kind: "error"; error: unknown };

export function planGoogleCalendarConnect(
  oauth: { url?: string } | null,
  oauthError: unknown | null,
): GoogleCalendarConnectPlan {
  const url = oauth?.url?.trim() ?? "";
  if (url.length > 0) return { kind: "oauth", url };
  if (oauthError && !isGoogleCalendarNotConfiguredError(oauthError)) {
    return { kind: "error", error: oauthError };
  }
  return { kind: "ics" };
}

export function formatCalendarConnectError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isGoogleOauthTestingDenied(error)) {
    return GOOGLE_TESTING_DENIED_MESSAGE;
  }
  const raw = message.toLowerCase();
  if (raw.includes("not authenticated") || raw.includes("not_authenticated")) {
    return "יש להיכנס לחשבון כדי לחבר יומן.";
  }
  if (
    raw.includes("provider is not enabled") ||
    raw.includes("unsupported provider") ||
    raw.includes("validation_failed")
  ) {
    return "חיבור היומן דורש חשבון Google.";
  }
  if (raw.includes("manual linking") || raw.includes("identity")) {
    return "לא ניתן לקשר את חשבון Google. נסו שוב.";
  }
  if (isGoogleCalendarNotConfiguredError(error)) {
    return "חיבור ליומן Google הראשי עדיין לא זמין.";
  }
  if (/[\u0590-\u05FF]/.test(message)) return message;
  return "לא ניתן לחבר את היומן כרגע.";
}

export function calendarSettingsButtonLabel(linked: boolean, busy: boolean): string {
  if (busy) return linked ? "מנתק..." : "מתחבר...";
  return linked ? "בטל חיבור" : "חבר";
}

export function calendarPrimaryButtonLabel(busy: boolean): string {
  return busy ? "מתחבר..." : "הוסף ליומן הראשי";
}

export function calendarGoogleOpenLabel(writable: boolean): string {
  return writable ? "פתח ביומן Google" : "הוסף כיומן BabiTk";
}

export function calendarUnlinkedHelpText(): string {
  return "«חבר» מוסיף את המשימות עם תאריך ישירות ליומן Google הראשי שלכם.";
}

export function calendarLinkedHelpText(input: {
  writable: boolean;
  eventCount: number;
}): string {
  if (!input.writable) {
    return "לחיצה על «כן» בטלפון מוסיפה יומן נפרד בשם BabiTk, ולא כותבת ליומן הראשי. לכן לא רואים שם את המשימות. לחצו «הוסף ליומן הראשי» כדי לכתוב אותן ישירות ליומן Google שלכם.";
  }
  if (input.eventCount > 0) {
    return `${input.eventCount} משימות עם תאריך נכתבות ליומן Google הראשי.`;
  }
  return "היומן הראשי מחובר. הוסיפו תאריך למשימה כדי שתופיע גם ב-Google.";
}
