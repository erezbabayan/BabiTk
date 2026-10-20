/**
 * Master switches for proactive WhatsApp and capture changes.
 * User settings still have to opt in for sends. Defaults stay off when a
 * change can message people or reshape a capture.
 */

function flag(name: string, defaultOn = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultOn;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return defaultOn;
}

export const featureFlags = {
  /** Daily morning summary. Also requires the user's opt-in column. */
  get morningBriefing() {
    return flag("WHATSAPP_MORNING_BRIEFING", false);
  },
  /** Evening nudge for tasks still open. Also requires the user's opt-in. */
  get followUp() {
    return flag("WHATSAPP_FOLLOWUP", false);
  },
  /** Split a long or voice capture into cards / a checklist. */
  get multiCard() {
    return flag("WHATSAPP_MULTI_CARD", false);
  },
  /** Store recurrence when the WhatsApp text says כל יום / כל 1 לחודש. */
  get recurrence() {
    return flag("WHATSAPP_RECURRENCE", true);
  },
  /** «בטל» restores the last capture, complete, or snooze. */
  get undo() {
    return flag("WHATSAPP_UNDO", true);
  },
  /** «תזיז ליום שני» and similar. Off so a sentence is not stolen from capture. */
  get nlCommands() {
    return flag("WHATSAPP_NL_COMMANDS", false);
  },
  /** Keyword board + priority when the user has not tagged the item. */
  get autoCategory() {
    return flag("WHATSAPP_AUTO_CATEGORY", false);
  },
  /** «מה רשמתי על …» token overlap, then embeddings when the RPC exists. */
  get semanticSearch() {
    return flag("WHATSAPP_SEMANTIC_SEARCH", false);
  },
} as const;
