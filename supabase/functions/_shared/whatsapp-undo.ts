import {
  popUndo,
  pushUndo,
  readUndoState,
  type UndoItemSnapshot,
  type UndoKind,
} from "./proactive-whatsapp.ts";

type Admin = { from: (table: string) => any };

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /whatsapp_undo|does not exist|Could not find the column/i.test(message);
}

function undoEnabled(): boolean {
  const raw = Deno.env.get("WHATSAPP_UNDO")?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

export async function rememberWhatsAppUndo(
  supabase: Admin,
  userId: string,
  kind: UndoKind,
  items: UndoItemSnapshot[],
): Promise<void> {
  if (!undoEnabled() || items.length === 0) return;
  try {
    const { data, error } = await supabase.from("users").select("whatsapp_undo").eq("id", userId).maybeSingle();
    if (error) {
      if (missingColumn(error)) return;
      throw error;
    }
    const next = pushUndo(readUndoState(data?.whatsapp_undo), {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind,
      items,
    });
    const saved = await supabase.from("users").update({ whatsapp_undo: next }).eq("id", userId);
    if (saved.error && !missingColumn(saved.error)) throw saved.error;
  } catch (error) {
    console.error("remember undo failed", error);
  }
}

export async function undoLastWhatsAppAction(supabase: Admin, userId: string): Promise<string> {
  if (!undoEnabled()) return "ביטול כבוי. הפעילו WHATSAPP_UNDO.";
  const { data, error } = await supabase.from("users").select("whatsapp_undo").eq("id", userId).maybeSingle();
  if (error) {
    if (missingColumn(error)) return "ביטול עדיין לא זמין. צריך להריץ את המיגרציה של whatsapp_undo.";
    throw error;
  }
  const popped = popUndo(readUndoState(data?.whatsapp_undo));
  if (!popped.entry) return "אין פעולה אחרונה לביטול.";
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
  await supabase.from("users").update({ whatsapp_undo: popped.state }).eq("id", userId);
  const titles = popped.entry.items.map((item) => item.title).filter(Boolean).join(", ");
  if (popped.entry.kind === "capture") return `בוטלה הקליטה: ${titles}`;
  if (popped.entry.kind === "complete") return `הסימון «בוצע» בוטל: ${titles}`;
  return `הדחייה בוטלה: ${titles}`;
}
