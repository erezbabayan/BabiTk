/** CallMeBot rotates WhatsApp bot numbers; try several until one returns APIKEY. */
export const CALLMEBOT_ACTIVATION_TEXT = "I allow callmebot to send me messages";

/**
 * Official / documented bots (order = try first).
 * Numbers change when bots “die”; keep several fallbacks from CallMeBot docs.
 * Current free-API page (2026): +34 644 91 07 79
 * Move page / legacy: +34 611 04 87 48, +34 644 95 73 56, +34 623 78 64 49
 */
export const CALLMEBOT_PRIMARY_BOT = "+34644910779";
export const CALLMEBOT_LEGACY_BOT = "+34644957356";

export const CALLMEBOT_BOT_NUMBERS = [
  CALLMEBOT_PRIMARY_BOT,
  "+34611048748",
  CALLMEBOT_LEGACY_BOT,
  "+34623786449",
  "+34621331709",
  "+34644179464",
  "+34684770005",
] as const;

export function callMeBotActivateUrl(botPhone: string): string {
  const digits = botPhone.replace(/\D/g, "");
  return (
    "https://wa.me/" +
    digits +
    "?text=" +
    encodeURIComponent(CALLMEBOT_ACTIVATION_TEXT)
  );
}

export function callMeBotRecoveryUrl(botPhone: string): string {
  const digits = botPhone.replace(/\D/g, "");
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent("Recover APIKey");
}

/** Default activation link shown in settings. */
export const CALLMEBOT_ACTIVATE_URL = callMeBotActivateUrl(CALLMEBOT_PRIMARY_BOT);

export function resolveCallMeBotApiKey(
  userKey: string | null | undefined,
): string | null {
  const personal = userKey?.trim();
  if (personal) return personal;
  const envKey = process.env.CALLMEBOT_DEFAULT_API_KEY?.trim();
  return envKey || null;
}

/** Instructions for the user to activate CallMeBot from their own WhatsApp. */
export function buildCallMeBotSetupMessage(): string {
  const primary = CALLMEBOT_PRIMARY_BOT;
  const primaryLink = CALLMEBOT_ACTIVATE_URL;
  const recoverLink = callMeBotRecoveryUrl(primary);
  const alt = CALLMEBOT_LEGACY_BOT;
  const altLink = callMeBotActivateUrl(alt);
  return (
    `מספר שולח נוסף ל־BabaiTk (צליל התראה)\n\n` +
    `בלי SIM שני משתמשים ב־CallMeBot — מספר ספרדי ששולח אליך עם צליל.\n\n` +
    `צעדים (אתה שולח מהטלפון שלך בלבד):\n` +
    `1) שמור באנשי קשר: ${primary}\n` +
    `2) פתח והשלח את ההודעה המוכנה:\n${primaryLink}\n\n` +
    `3) הבוט יחזיר APIKEY — העתק להגדרות וואטסאפ ב־BabaiTk ושמור.\n\n` +
    `אם כבר הופעל בעבר ואין מפתח:\n${recoverLink}\n\n` +
    `אם אין תשובה תוך 2 דקות — חכה 24 שעות, או נסה:\n` +
    `${alt}\n${altLink}\n\n` +
    `אחרי השמירה, «שלח הודעת בדיקה» — אמורה לקפוץ עם צליל.`
  );
}
