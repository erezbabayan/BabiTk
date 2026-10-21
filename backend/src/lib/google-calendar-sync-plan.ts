/**
 * One-way export already runs through google-calendar.ts when the user
 * connected Google. Two-way pull runs only when GOOGLE_CALENDAR_BIDIRECTIONAL
 * is true and the OAuth client id and secret are real.
 */

export type CalendarSyncMode = "unconfigured" | "export" | "bidirectional";

export type CalendarSyncReadiness = {
  mode: CalendarSyncMode;
  bidirectional: boolean;
  credentialsPresent: boolean;
  bidirectionalRequested: boolean;
  timezone: "Asia/Jerusalem";
  scope: "https://www.googleapis.com/auth/calendar.events";
  nextSteps: string[];
};

export function describeCalendarSyncReadiness(input: {
  clientId?: string | null;
  clientSecret?: string | null;
  bidirectionalRequested?: boolean;
}): CalendarSyncReadiness {
  const clientId = input.clientId?.trim() ?? "";
  const clientSecret = input.clientSecret?.trim() ?? "";
  const credentialsPresent =
    clientId.length > 8 &&
    clientSecret.length > 8 &&
    !/your-client|placeholder|YOUR_ID/i.test(clientId) &&
    !/placeholder|GOCSPX-\.\.\./i.test(clientSecret);
  const bidirectionalRequested = input.bidirectionalRequested === true;
  const bidirectional = credentialsPresent && bidirectionalRequested;

  return {
    mode: bidirectional ? "bidirectional" : credentialsPresent ? "export" : "unconfigured",
    bidirectional,
    credentialsPresent,
    bidirectionalRequested,
    timezone: "Asia/Jerusalem",
    scope: "https://www.googleapis.com/auth/calendar.events",
    nextSteps: !credentialsPresent
      ? [
          "מלאו GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET.",
          "חברו את היומן מהאפליקציה (OAuth). הייצוא הקיים נדלק אחרי החיבור.",
          "סנכרון דו-כיווני נשאר כבוי עד GOOGLE_CALENDAR_BIDIRECTIONAL=true.",
        ]
      : bidirectional
        ? [
            "כל 15 דקות נמשכים שינויים באירועים שכבר מקושרים לכרטיס.",
            "תאריך מקומי חדש יותר לא נדרס.",
            "שינוי ב-BabiTk ממשיך להידחף במסלול הייצוא הקיים.",
          ]
        : [
            "הייצוא ליומן פעיל אחרי חיבור המשתמש.",
            "כדי למשוך שינויים מגוגל הגדירו GOOGLE_CALENDAR_BIDIRECTIONAL=true.",
          ],
  };
}
