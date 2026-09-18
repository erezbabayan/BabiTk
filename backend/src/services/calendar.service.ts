import { google } from "googleapis";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  calendarEventBody,
  createOAuthState,
  parseOAuthState,
  shouldUpsertCalendarEvent,
  type CalendarItemSnapshot,
} from "../lib/google-calendar.js";

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

export async function buildGoogleAuthUrl(userId: string): Promise<string> {
  const client = getGoogleOAuthClient();
  const state = await createOAuthState(userId, env.googleClientSecret ?? "");
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES,
    state,
  });
}

export async function exchangeGoogleCode(
  state: string,
  code: string,
): Promise<void> {
  if (!env.googleClientSecret) {
    throw new Error("Google Calendar is not configured");
  }
  const userId = await parseOAuthState(state, env.googleClientSecret);
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

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({
      google_refresh_token: null,
      google_calendar_enabled: false,
    })
    .eq("id", userId);
  if (error) {
    throw new Error(`Failed to disconnect Google Calendar: ${error.message}`);
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

export async function deleteCalendarEvent(
  userId: string,
  eventId: string | null | undefined,
): Promise<void> {
  if (!eventId) return;
  const calendar = await getCalendarClientForUser(userId);
  if (!calendar) return;
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch {
    // Missing events are fine — the local id will be cleared by the caller.
  }
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

  const eventBody = calendarEventBody(
    {
      title: params.title,
      content: params.content,
      due_date: params.dueDate,
    },
    env.cronTimezone,
  );

  if (params.existingEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId: "primary",
        eventId: params.existingEventId,
        requestBody: eventBody,
      });
      return updated.data.id ?? params.existingEventId;
    } catch {
      // Recreate when the stored event was removed in Google Calendar.
    }
  }

  const created = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
  });

  return created.data.id ?? null;
}

export async function reconcileItemCalendar(params: {
  userId: string;
  itemId: string;
  item: CalendarItemSnapshot;
}): Promise<string | null> {
  if (shouldUpsertCalendarEvent(params.item) && params.item.due_date) {
    return await syncTaskToCalendar({
      userId: params.userId,
      itemId: params.itemId,
      title: params.item.title,
      content: params.item.content,
      dueDate: params.item.due_date,
      existingEventId: params.item.calendar_event_id,
    });
  }
  await deleteCalendarEvent(params.userId, params.item.calendar_event_id);
  return null;
}
