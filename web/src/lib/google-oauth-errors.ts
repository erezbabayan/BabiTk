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
