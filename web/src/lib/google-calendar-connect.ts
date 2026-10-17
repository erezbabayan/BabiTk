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
  calendarOauthPublishTitle,
  calendarPublishCaption,
  calendarTestingDeniedUserMessage,
  isGoogleOauthTestingDenied,
} from "./google-oauth-errors.ts";

export function googleCalendarIdentityOptions(
  redirectTo: string,
  loginHint?: string | null,
): {
  provider: "google";
  options: {
    redirectTo: string;
    scopes: string;
    queryParams: {
      access_type: "offline";
      prompt: "consent";
      include_granted_scopes: string;
      login_hint?: string;
    };
  };
} {
  const hint = loginHint?.trim() ?? "";
  return {
    provider: "google",
    options: {
      redirectTo,
      scopes: `${GOOGLE_CALENDAR_SCOPE} email profile openid`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        ...(hint.includes("@") ? { login_hint: hint } : {}),
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
  | { kind: "google"; url: string; feedUrl?: string }
  | { kind: "error"; error: unknown };

/** Google Calendar web page that accepts an HTTPS ICS URL. The mobile app cannot. */
export const GOOGLE_CALENDAR_ADD_BY_URL =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

export const GOOGLE_CALENDAR_ADDED_KEY = "babitk-google-calendar-added";

export function readGoogleCalendarAdded(): boolean {
  try {
    return localStorage.getItem(GOOGLE_CALENDAR_ADDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGoogleCalendarAdded(added: boolean): void {
  try {
    if (added) localStorage.setItem(GOOGLE_CALENDAR_ADDED_KEY, "1");
    else localStorage.removeItem(GOOGLE_CALENDAR_ADDED_KEY);
  } catch {
    // Private mode — keep in-memory UI state only.
  }
}

export function planGoogleCalendarConnect(
  oauth: { url?: string } | null,
  oauthError: unknown | null,
  googleAdd?: { url?: string; feedUrl?: string } | null,
): GoogleCalendarConnectPlan {
  const addUrl = googleAdd?.url?.trim() ?? "";
  const feedUrl = googleAdd?.feedUrl?.trim() ?? "";
  if (addUrl.length > 0) {
    return feedUrl
      ? { kind: "google", url: addUrl, feedUrl }
      : { kind: "google", url: addUrl };
  }
  const url = oauth?.url?.trim() ?? "";
  if (url.length > 0) return { kind: "oauth", url };
  if (oauthError) return { kind: "error", error: oauthError };
  return { kind: "error", error: new Error("לא התקבלה כתובת חיבור ליומן") };
}

export function googleCalendarAppCapturesAdd(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

export function calendarGoogleAppHelpText(): string {
  return "באפליקציית Google Calendar אי אפשר להוסיף יומן מכתובת. מוסיפים במחשב, ואז הוא מופיע באפליקציה תחת «יומנים אחרים» בשם BabiTk — צריך לסמן אותו.";
}

export function calendarFromUrlSteps(): string[] {
  return [
    "העתיקו את כתובת היומן.",
    "במחשב פתחו את Google Calendar בדפדפן (לא באפליקציה).",
    "משמאל: יומנים אחרים → + → מכתובת URL, הדביקו והוסיפו.",
    "באפליקציה: תפריט הצד → סמנו את BabiTk תחת יומנים אחרים.",
  ];
}

export function formatCalendarConnectError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isGoogleOauthTestingDenied(error)) {
    return GOOGLE_TESTING_DENIED_MESSAGE;
  }
  const raw = message.toLowerCase();
  if (raw.includes("missing_refresh_token")) {
    return "Google לא החזיר הרשאת רענון. בטלו את הגישה ל-BabiTk בחשבון Google ונסו שוב.";
  }
  if (raw.includes("invalid_state") || raw.includes("expired_state")) {
    return "פג תוקף חיבור היומן. לחצו «חבר» שוב מאותו חלון.";
  }
  if (raw.includes("calendar_user_not_found")) {
    return "לא נמצא חשבון לשמירת חיבור היומן. היכנסו שוב ונסו «חבר».";
  }
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

export function calendarUnlinkedHelpText(): string {
  return "יומן BabiTk במערכת מציג משימות לפי תאריך. «חבר» מוסיף אותן גם ליומן Google.";
}

export function calendarLinkedHelpText(input: {
  writable: boolean;
  eventCount: number;
  googleLinked?: boolean;
}): string {
  if (input.writable) {
    if (input.eventCount > 0) {
      return `${input.eventCount} משימות עם תאריך מופיעות ביומן BabiTk ונכתבות ליומן Google הראשי.`;
    }
    return "היומן במערכת מחובר ליומן Google הראשי. הוסיפו תאריך למשימה כדי שתופיע בשניהם.";
  }
  if (input.googleLinked) {
    if (input.eventCount > 0) {
      return `${input.eventCount} משימות עם תאריך ביומן BabiTk. ב-Google הן תחת «יומנים אחרים» בשם BabiTk — סמנו אותו בתפריט האפליקציה.`;
    }
    return "היומן במערכת מחובר. ב-Google חפשו BabiTk תחת «יומנים אחרים» וסמנו אותו באפליקציה.";
  }
  return "לחצו «חבר» כדי להוסיף משימות עם תאריך ליומן Google. יומן BabiTk במערכת כבר פעיל.";
}

export function shouldPersistGoogleCalendarSessionLink(input: {
  pendingIdentityLink: boolean;
  refreshToken?: string | null;
}): boolean {
  return input.pendingIdentityLink && (input.refreshToken ?? "").trim().length > 8;
}

export function calendarReturnFromQuery(search: string): {
  connected: boolean;
  failed: boolean;
  error: string | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const calendar = params.get("calendar");
  if (calendar === "connected") {
    return { connected: true, failed: false, error: null };
  }
  if (calendar === "error") {
    const err = (params.get("error") ?? "").trim();
    const desc = (params.get("error_description") ?? "").trim();
    const raw = [err, desc].filter(Boolean).join(":");
    return {
      connected: false,
      failed: true,
      error: formatCalendarConnectError(raw || "oauth_failed"),
    };
  }
  return { connected: false, failed: false, error: null };
}
