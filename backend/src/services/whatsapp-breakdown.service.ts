import { featureFlags } from "../lib/feature-flags.js";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  breakdownReply,
  confirmedStepCards,
  parseBreakdownAnswer,
  proposeBreakdown,
  readPendingBreakdown,
} from "../lib/task-breakdown.js";
import { learnMorningHour, readHabitMemory } from "../lib/habit-memory.js";

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /does not exist|Could not find the column/i.test(message);
}

/** Returns a reply when this message is a proposal or a yes/no. Null means keep capturing. */
export async function handleTaskBreakdown(userId: string, text: string, now = new Date()): Promise<string | null> {
  if (!featureFlags.taskBreakdown || !env.isSupabaseConfigured) return null;
  const answer = parseBreakdownAnswer(text);
  const proposal = answer ? null : proposeBreakdown(text, now);
  if (!answer && !proposal) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("whatsapp_pending_breakdown")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (missingColumn(error)) return null;
    return null;
  }

  if (proposal) {
    const { error: updateError } = await supabase
      .from("users")
      .update({ whatsapp_pending_breakdown: proposal })
      .eq("id", userId);
    if (updateError) return null;
    return breakdownReply(proposal);
  }

  const pending = readPendingBreakdown(data?.whatsapp_pending_breakdown);
  if (!pending) return null;
  await supabase.from("users").update({ whatsapp_pending_breakdown: null }).eq("id", userId);
  if (answer === "no") return "לא שמרתי את השלבים.";

  const cards = confirmedStepCards(pending);
  const stamp = Date.now();
  const { error: insertError } = await supabase.from("mindtasker_items").insert(
    cards.map((card, index) => ({
      user_id: userId,
      title: card.title,
      content: card.content,
      is_actionable: true,
      status: "inbox",
      tags: [],
      due_date: card.due_date,
      metadata: { source: "whatsapp_text", breakdown: true },
      sort_order: stamp + index,
      last_interacted_at: new Date(stamp).toISOString(),
    })),
  );
  if (insertError) return "לא הצלחתי לשמור את השלבים. נסו שוב.";
  return `שמרתי ${cards.length} שלבים.`;
}

/** Fire-and-forget. Only when the card text says בבוקר. */
export function rememberMorningHabit(userId: string, title: string, content: string, dueIso: string): void {
  if (!featureFlags.habits || !env.isSupabaseConfigured) return;
  if (!/בבוקר/u.test(`${title}\n${content}`)) return;
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(dueIso));
  const hour = Number(hourText === "24" ? "0" : hourText);
  if (!Number.isInteger(hour)) return;
  void (async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("users")
        .select("whatsapp_habits")
        .eq("id", userId)
        .maybeSingle();
      if (error) return;
      const memory = readHabitMemory(data?.whatsapp_habits);
      const learned = learnMorningHour(memory, hour);
      if (learned === memory) return;
      await supabase.from("users").update({ whatsapp_habits: learned }).eq("id", userId);
    } catch {
      // Habit memory is optional.
    }
  })();
}
