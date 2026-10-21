import { randomUUID } from "node:crypto";
import {
  emptyUndoState,
  popUndo,
  pushUndo,
  readUndoState,
  type UndoItemSnapshot,
  type UndoKind,
} from "../lib/proactive-whatsapp.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { env } from "../config/env.js";

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /whatsapp_undo/i.test(message) ||
    /does not exist/i.test(message) ||
    /Could not find the column/i.test(message)
  );
}

async function loadState(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("whatsapp_undo")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (missingColumn(error)) return { state: emptyUndoState(), available: false };
    throw new Error(error.message);
  }
  return { state: readUndoState(data?.whatsapp_undo), available: true };
}

async function saveState(userId: string, state: ReturnType<typeof readUndoState>): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("users").update({ whatsapp_undo: state }).eq("id", userId);
  if (error) {
    if (missingColumn(error)) return false;
    throw new Error(error.message);
  }
  return true;
}

export async function rememberWhatsAppUndo(
  userId: string,
  kind: UndoKind,
  items: UndoItemSnapshot[],
): Promise<void> {
  if (!env.isSupabaseConfigured || items.length === 0) return;
  try {
    const loaded = await loadState(userId);
    if (!loaded.available) return;
    const next = pushUndo(loaded.state, {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind,
      items,
    });
    await saveState(userId, next);
  } catch {
    // Undo history must not block capture or a reply command.
  }
}

export async function undoLastWhatsAppAction(userId: string): Promise<string> {
  if (!env.isSupabaseConfigured) return "ביטול זמין רק כשמסד הנתונים מחובר.";
  const loaded = await loadState(userId);
  if (!loaded.available) {
    return "ביטול עדיין לא זמין. צריך להריץ את המיגרציה של whatsapp_undo.";
  }
  const popped = popUndo(loaded.state);
  if (!popped.entry) return "אין פעולה אחרונה לביטול.";

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  for (const item of popped.entry.items) {
    if (popped.entry.kind === "capture") {
      await supabase
        .from("mindtasker_items")
        .update({ deleted_at: now, last_interacted_at: now })
        .eq("id", item.id)
        .eq("user_id", userId);
      continue;
    }
    await supabase
      .from("mindtasker_items")
      .update({
        status: item.status,
        due_date: item.due_date,
        completed_at: item.status === "completed" ? now : null,
        deleted_at: item.deleted_at,
        last_interacted_at: now,
      })
      .eq("id", item.id)
      .eq("user_id", userId);
  }
  await saveState(userId, popped.state);
  const titles = popped.entry.items.map((item) => item.title).filter(Boolean).join(", ");
  if (popped.entry.kind === "capture") return `בוטלה הקליטה: ${titles}`;
  if (popped.entry.kind === "complete") return `הסימון «בוצע» בוטל: ${titles}`;
  return `הדחייה בוטלה: ${titles}`;
}
