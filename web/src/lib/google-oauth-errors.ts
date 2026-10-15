/** Google Auth Platform audience page for the live BabiTk Cloud project. */
export const GOOGLE_AUTH_AUDIENCE_URL =
  "https://console.cloud.google.com/auth/audience?project=babaitk";

export const GOOGLE_AUTH_BRANDING_URL =
  "https://console.cloud.google.com/auth/branding?project=babaitk";

export const BABITK_PRIVACY_URL =
  "https://erezbabayan.github.io/BabiTk/privacy.html";

export const BABITK_TERMS_URL = "https://erezbabayan.github.io/BabiTk/terms.html";

export const CALENDAR_OAUTH_ERROR_KEY = "babitk-calendar-oauth-error";

export const GOOGLE_TESTING_DENIED_MESSAGE =
  "Google חסם את חיבור היומן כי האפליקציה במצב בדיקות. פרסמו אותה ב-Google Auth Platform (Publish app) ואז לחצו «חבר» שוב.";

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
