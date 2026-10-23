import {
  NOTEBOOK_REMINDER_DEFAULTS,
  notebookReminderPrefsFromRow,
  notebookReminderRowPatch,
  type NotebookReminderPrefs,
} from "./notebook-reminder-prefs";
import { isMissingSchemaError } from "./schema-compat";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";

const DEMO_KEY = "mindtasker:demo:notebook-reminder";
const COLUMNS = "notebook_reminder_enabled, notebook_reminder_hour, notebook_reminder_minute";

function readDemo(): NotebookReminderPrefs {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? { ...NOTEBOOK_REMINDER_DEFAULTS, ...(JSON.parse(raw) as Partial<NotebookReminderPrefs>) } : NOTEBOOK_REMINDER_DEFAULTS;
  } catch {
    return NOTEBOOK_REMINDER_DEFAULTS;
  }
}

async function sessionUserId(): Promise<string> {
  const supabase = requireSupabase();
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (id) return id;
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) throw new Error("יש להתחבר כדי לשמור הגדרות");
  return userData.user.id;
}

/** null when the DB migration is not applied yet (the UI then hides the controls). */
export async function loadNotebookReminderPrefs(): Promise<NotebookReminderPrefs | null> {
  if (isDemoMode || !isSupabaseConfigured) return readDemo();
  const supabase = requireSupabase();
  const userId = await sessionUserId();
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
  if (isDemoMode || !isSupabaseConfigured) {
    const next = { ...readDemo(), ...patch };
    localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    return next;
  }
  const supabase = requireSupabase();
  const userId = await sessionUserId();
  const { error } = await supabase.from("users").update(notebookReminderRowPatch(patch)).eq("id", userId);
  if (error) throw error;
  return (await loadNotebookReminderPrefs()) ?? { ...NOTEBOOK_REMINDER_DEFAULTS, ...patch };
}
