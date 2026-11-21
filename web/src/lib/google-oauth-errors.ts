/** Google Auth Platform audience page for the live BabiTk Cloud project. */
export const GOOGLE_AUTH_AUDIENCE_URL =
  "https://console.cloud.google.com/auth/audience?project=babaitk";

export const GOOGLE_AUTH_BRANDING_URL =
  "https://console.cloud.google.com/auth/branding?project=babaitk";

export const BABITK_PRIVACY_URL =
  "https://erezbabayan.github.io/BabiTk/privacy.html";

export const BABITK_TERMS_URL = "https://erezbabayan.github.io/BabiTk/terms.html";

export const CALENDAR_OAUTH_ERROR_KEY = "babitk-calendar-oauth-error";
export const CALENDAR_OAUTH_ATTEMPT_KEY = "babitk-calendar-oauth-attempt";

export const GOOGLE_TESTING_DENIED_MESSAGE =
  "Google חסם כתיבה ליומן הראשי. יומן BabiTk במערכת מציג את המשימות לפי תאריך.";

export const CALENDAR_OAUTH_INCOMPLETE_MESSAGE =
  "Google חסם את חיבור היומן הראשי. יומן BabiTk במערכת ממשיך להציג משימות לפי תאריך.";

export function calendarOauthPublishTitle(): string {
  return "פרסם ב-Google";
}

export function calendarOauthPublishLabel(): string {
  return "פתחו במחשב — פרסום ב-Google";
}

export function calendarOauthPublishHelp(): string {
  return "«פרסם» לא מפרסם מהטלפון. הוא פותח את Google Cloud במחשב. שם לוחצים Publish app, ואז חוזרים לכאן ולוחצים «הוסף ליומן הראשי».";
}

export function calendarPublishCaption(): string {
  return "פעולה חד־פעמית במחשב. בטלפון Google Cloud לא נותן לסיים פרסום.";
}

export function calendarTestingDeniedUserMessage(): string {
  return "Google חוסם כרגע כתיבה ליומן הראשי. יומן BabiTk במערכת ממשיך לעבוד.";
}

function oauthErrorText(
  error: unknown,
  description?: string | null,
): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [message, description ?? ""].join(" ").toLowerCase();
}

export function isGoogleOauthTestingDenied(
  error: unknown,
  description?: string | null,
): boolean {
  const raw = oauthErrorText(error, description);
  if (!raw.trim()) return false;
  const testing =
    raw.includes("403") ||
    raw.includes("testing") ||
    raw.includes("verification") ||
    raw.includes("currently being tested") ||
    raw.includes("only testers") ||
    raw.includes("developer-approved") ||
    raw.includes("has not completed") ||
    raw.includes("hasn't completed") ||
    raw.includes("access_denied:403") ||
    raw.includes("גישה חסומה") ||
    raw.includes("תהליך האימות") ||
    raw.includes("לא הושלם") ||
    raw.includes("בבדיקה") ||
    raw.includes("בודקים");
  const denied =
    raw.includes("access_denied") ||
    raw.includes("forbidden") ||
    raw.includes("access blocked") ||
    raw.includes("גישה חסומה");
  return denied && testing;
}

export const CALENDAR_OAUTH_ERROR_CODES = [
  "access_denied",
  "testing_denied",
  "generic",
] as const;

export type CalendarOauthErrorCode = (typeof CALENDAR_OAUTH_ERROR_CODES)[number];

export const CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE =
  "ההתחברות עם Google בוטלה.";

export const CALENDAR_OAUTH_GENERIC_MESSAGE =
  "לא ניתן לחבר את היומן כרגע.";

export function isCalendarOauthErrorCode(
  value: string | null | undefined,
): value is CalendarOauthErrorCode {
  return (
    value === "access_denied" ||
    value === "testing_denied" ||
    value === "generic"
  );
}

/** Store only a fixed code literal — never a raw OAuth error string. */
export function storeCalendarOauthErrorCode(code: CalendarOauthErrorCode): void {
  if (code === "testing_denied") {
    sessionStorage.setItem(CALENDAR_OAUTH_ERROR_KEY, "testing_denied");
    return;
  }
  if (code === "access_denied") {
    sessionStorage.setItem(CALENDAR_OAUTH_ERROR_KEY, "access_denied");
    return;
  }
  sessionStorage.setItem(CALENDAR_OAUTH_ERROR_KEY, "generic");
}

export function classifyCalendarOauthError(
  error: unknown,
  description?: string | null,
): CalendarOauthErrorCode {
  if (isGoogleOauthTestingDenied(error, description)) {
    return "testing_denied";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const raw = [message, description ?? ""].join(" ").toLowerCase();
  if (raw.includes("access_denied") || raw.includes("user denied")) {
    return "access_denied";
  }
  return "generic";
}

export function calendarOauthErrorMessage(
  code: CalendarOauthErrorCode,
): string {
  if (code === "testing_denied") return GOOGLE_TESTING_DENIED_MESSAGE;
  if (code === "access_denied") return CALENDAR_OAUTH_ACCESS_DENIED_MESSAGE;
  return CALENDAR_OAUTH_GENERIC_MESSAGE;
}

/** Map a stored session value (code, or leftover text) to a safe display message. */
export function messageForStoredCalendarOauthError(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const code = isCalendarOauthErrorCode(stored)
    ? stored
    : classifyCalendarOauthError(stored);
  return calendarOauthErrorMessage(code);
}

