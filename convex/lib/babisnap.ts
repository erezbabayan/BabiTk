/** Shared BabiSnap pairing text and link builders. No token is logged here. */

export const BABISNAP_DEVICE_NAME = "BabiSnap";

/** Android APK. An empty string hides the download button. */
export const BABISNAP_DOWNLOAD_URL =
  "https://github.com/erezbabayan/BabiSnap/releases/latest/download/BabiSnap.apk";

/** Voice-ingest endpoint embedded in the BabiSnap pair link. */
export const BABISNAP_VOICE_INGEST_URL =
  "https://ghibfuinantybqidwadj.supabase.co/functions/v1/voice-ingest";

export const BABISNAP_COPY = {
  connected: "מחובר",
  disconnected: "לא מחובר",
  lastPrefix: "הקלטה אחרונה",
  noneYet: "עדיין לא הגיעה הקלטה",
  download: "הורד והתקן את BabiSnap",
  installNote:
    "הורידו את הקובץ, אשרו התקנה מהמקור הזה, פתחו את BabiSnap, ואז חזרו לכאן ולחצו «חבר».",
  connect: "חבר את BabiSnap",
  disconnect: "נתק",
  disconnectConfirm: "לנתק את BabiSnap? החיבור הנוכחי יפסיק לעבוד.",
  open: "פתח ב-BabiSnap וחבר",
  hint: "הכפתור פותח את BabiSnap ושומר את החיבור.",
  once: "הקישור מוצג פעם אחת ולא יוצג שוב.",
  copy: "העתק קישור",
  copied: "הועתק",
  downloadQr: "קוד להורדת BabiSnap",
  pairQr: "קוד לחיבור BabiSnap",
} as const;

export function babisnapDownloadUrl(configured = BABISNAP_DOWNLOAD_URL): string | null {
  const trimmed = configured.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Deep link for the Android app. Returns null until a token exists. The url param is fixed. */
export function babisnapPairLink(token: string): string | null {
  const trimmedToken = token.trim();
  if (!trimmedToken) return null;
  return `babisnap://pair?token=${encodeURIComponent(trimmedToken)}&url=${encodeURIComponent(BABISNAP_VOICE_INGEST_URL)}`;
}

export function formatBabisnapLastUsed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export interface BabisnapStatus {
  connected: boolean;
  lastUsedAt: string | null;
  token: string | null;
}

export function parseBabisnapResponse(payload: unknown): BabisnapStatus {
  const body =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (body.ok === false) {
    const code = typeof body.error === "string" ? body.error : "server";
    throw new Error(code);
  }
  return {
    connected: body.connected === true,
    lastUsedAt: typeof body.last_used_at === "string" && body.last_used_at ? body.last_used_at : null,
    token: typeof body.token === "string" && body.token ? body.token : null,
  };
}
