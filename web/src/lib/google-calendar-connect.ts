export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

export function formatCalendarConnectError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
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
  return "לא ניתן לחבר את היומן כרגע.";
}

export function calendarSettingsButtonLabel(linked: boolean, busy: boolean): string {
  if (busy) return linked ? "מנתק..." : "מתחבר...";
  return linked ? "בטל חיבור" : "חבר";
}
