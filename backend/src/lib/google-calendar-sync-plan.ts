/**
 * Two-way Google Calendar sync is not turned on here.
 * Dated tasks already export through the existing OAuth path in
 * `google-calendar.ts` when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET exist.
 * This module is the seam for a later bidirectional job: pull busy windows,
 * push BabiTk due dates, and keep an external event id on the card.
 */

export type CalendarSyncMode = "scaffold";

export type CalendarSyncReadiness = {
  mode: CalendarSyncMode;
  bidirectional: false;
  credentialsPresent: boolean;
  timezone: "Asia/Jerusalem";
  nextSteps: string[];
};

export function describeCalendarSyncReadiness(input: {
  clientId?: string | null;
  clientSecret?: string | null;
}): CalendarSyncReadiness {
  const clientId = input.clientId?.trim() ?? "";
  const clientSecret = input.clientSecret?.trim() ?? "";
  const credentialsPresent =
    clientId.length > 8 &&
    clientSecret.length > 8 &&
    !/your-client|placeholder|YOUR_ID/i.test(clientId) &&
    !/placeholder|GOCSPX-\.\.\./i.test(clientSecret);

  return {
    mode: "scaffold",
    bidirectional: false,
    credentialsPresent,
    timezone: "Asia/Jerusalem",
    nextSteps: credentialsPresent
      ? [
          "הייצוא הקיים ליומן נשאר כפי שהוא.",
          "סנכרון דו-כיווני (משיכה של חלונות תפוסים ודחיפת שינויים חזרה) עדיין לא רץ.",
          "השלב הבא: job שקורא events.list וכותב calendar_event_id בלי לדרוס תזכורת מקומית.",
        ]
      : [
          "אין GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET בסביבה.",
          "אפשר לחבר ייצוא קיים אחרי שממלאים את המשתנים. אין קריאת Google בקובץ הזה.",
        ],
  };
}
