import { google } from "googleapis";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export function getGoogleOAuthClient() {
  if (!env.googleClientId || !env.googleClientSecret || !env.googleRedirectUri) {
    throw new Error("Google Calendar is not configured");
  }

  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri,
  );
}

export function buildGoogleAuthUrl(userId: string): string {
  const client = getGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES,
    state: userId,
  });
}

export async function exchangeGoogleCode(
  userId: string,
  code: string,
): Promise<void> {
  const client = getGoogleOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — revoke access and retry");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({
      google_refresh_token: tokens.refresh_token,
      google_calendar_enabled: true,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to store Google token: ${error.message}`);
  }
}

async function getCalendarClientForUser(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("google_refresh_token, google_calendar_enabled")
    .eq("id", userId)
    .single();

  if (error || !data?.google_calendar_enabled || !data.google_refresh_token) {
    return null;
  }

  const client = getGoogleOAuthClient();
  client.setCredentials({ refresh_token: data.google_refresh_token });
  return google.calendar({ version: "v3", auth: client });
}

export async function syncTaskToCalendar(params: {
  userId: string;
  itemId: string;
  title: string;
  content: string;
  dueDate: string;
  existingEventId?: string | null;
}): Promise<string | null> {
  const calendar = await getCalendarClientForUser(params.userId);
  if (!calendar) return null;

  const start = new Date(params.dueDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const timeZone = env.cronTimezone;

  const eventBody = {
    summary: params.title,
    description: `${params.content}\n\n— MindTasker`.trim(),
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };

  if (params.existingEventId) {
    const updated = await calendar.events.update({
      calendarId: "primary",
      eventId: params.existingEventId,
      requestBody: eventBody,
    });
    return updated.data.id ?? params.existingEventId;
  }

  const created = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
  });

  return created.data.id ?? null;
}
