/**
 * Action buttons on item reminder notifications (Android).
 *
 * The buttons run without opening the app (opensAppToForeground: false):
 * - app running (foreground/background): addNotificationResponseReceivedListener
 * - app backgrounded or killed: the expo-task-manager task below (Android runs it
 *   for action taps). Defined at module scope so the headless JS run registers it.
 * Writes go through the signed-in Supabase client (RLS: own rows only), same as
 * the board's completeTask/snoozeTask.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { requireSupabase, isSupabaseConfigured } from "./supabase";
import {
  buildReminderActionPatch,
  parseReminderAction,
  REMINDER_CATEGORY_BUTTONS,
  reminderItemIdFromData,
  type ReminderActionItem,
} from "./reminder-notification-actions";

export const REMINDER_ACTION_TASK = "BABITK_REMINDER_ACTION_TASK";

const handled = new Set<string>();

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}|${response.actionIdentifier}`;
}

export async function registerReminderNotificationCategories(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all(
    Object.entries(REMINDER_CATEGORY_BUTTONS).map(([identifier, buttons]) =>
      Notifications.setNotificationCategoryAsync(
        identifier,
        buttons.map((button) => ({
          identifier: button.identifier,
          buttonTitle: button.buttonTitle,
          options: { opensAppToForeground: false },
        })),
      ),
    ),
  );
}

async function applyReminderAction(
  itemId: string,
  action: "done" | "hour" | "tomorrow",
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = requireSupabase();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return false;
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, title, content, is_actionable, status, due_date, metadata, deleted_at")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const patch = buildReminderActionPatch(data as ReminderActionItem, action, new Date());
  if (!patch) return false;
  const { error: updateError } = await supabase
    .from("mindtasker_items")
    .update(patch)
    .eq("id", itemId);
  if (updateError) throw updateError;
  return true;
}

/**
 * Handle a button tap. Returns true when the response was a reminder button
 * (handled here), false for body taps and unrelated notifications.
 */
export async function handleReminderActionResponse(
  response: Notifications.NotificationResponse,
): Promise<boolean> {
  const action = parseReminderAction(response.actionIdentifier);
  if (!action || action === "open") return false;
  const itemId = reminderItemIdFromData(response.notification.request.content.data);
  if (!itemId) return false;
  const key = responseKey(response);
  // The listener and the background task can both see one tap while the app is alive.
  if (handled.has(key)) return true;
  handled.add(key);
  try {
    await applyReminderAction(itemId, action);
  } catch (error) {
    handled.delete(key);
    console.warn(
      "[reminder-action] failed:",
      error instanceof Error ? error.message : "unknown",
    );
  } finally {
    await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(
      () => undefined,
    );
  }
  return true;
}

function isNotificationResponse(value: unknown): value is Notifications.NotificationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "actionIdentifier" in value &&
      "notification" in value,
  );
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(REMINDER_ACTION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    REMINDER_ACTION_TASK,
    async ({ data }) => {
      if (isNotificationResponse(data)) {
        await handleReminderActionResponse(data);
      }
    },
  );
}

let setupStarted = false;

/** Register categories + background task once per JS runtime. Safe to call repeatedly. */
export function setupReminderNotificationActions(): void {
  if (setupStarted || Platform.OS === "web") return;
  setupStarted = true;
  void registerReminderNotificationCategories().catch((error) => {
    console.warn(
      "[reminder-action] categories skipped:",
      error instanceof Error ? error.message : "unknown",
    );
  });
  void Notifications.registerTaskAsync(REMINDER_ACTION_TASK).catch((error) => {
    console.warn(
      "[reminder-action] task skipped:",
      error instanceof Error ? error.message : "unknown",
    );
  });
}

setupReminderNotificationActions();
