import {
  NOTEBOOK_REMINDER_DEFAULTS,
  notebookReminderPrefsFromRow,
  notebookReminderRowPatch,
  type NotebookReminderPrefs,
} from "./notebook-reminder-prefs";
import { isMissingSchemaError } from "./schema-compat";
import { requireSupabase } from "./supabase";
import { currentUserId } from "./whatsapp-gateway";

const COLUMNS = "notebook_reminder_enabled, notebook_reminder_hour, notebook_reminder_minute";

/** Same Supabase users row as the web settings. null = migration not applied yet. */
export async function loadNotebookReminderPrefs(): Promise<NotebookReminderPrefs | null> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("יש להתחבר כדי לראות את ההגדרות");
  const { data, error } = await supabase.from("users").select(COLUMNS).eq("id", userId).maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  return notebookReminderPrefsFromRow((data ?? null) as Record<string, unknown> | null);
}

export async function saveNotebookReminderPrefs(
  patch: Partial<NotebookReminderPrefs>,
): Promise<NotebookReminderPrefs> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("יש להתחבר כדי לשמור הגדרות");
  const { error } = await supabase.from("users").update(notebookReminderRowPatch(patch)).eq("id", userId);
  if (error) throw error;
  return (await loadNotebookReminderPrefs()) ?? { ...NOTEBOOK_REMINDER_DEFAULTS, ...patch };
}
