import type { UsageSummary } from "./api";

export interface ChannelLimitRow {
  label: string;
  value: string;
}

export interface ChannelInfo {
  id: string;
  icon: string;
  title: string;
  description: string;
  platforms: string;
  limits: ChannelLimitRow[];
  notes?: string[];
}

export const FREE_TIER_DEFAULTS = {
  audioMinutesPerMonth: 30,
  aiParsesPerMonth: 50,
  periodDays: 30,
} as const;

export const TECH_LIMITS = {
  voiceApiMaxMb: 2,
  ocrApiMaxMb: 4,
  storageMaxMb: 10,
  minTextChars: 3,
  phoneCodeTtlMinutes: 10,
} as const;

export const CHANNELS: Record<string, ChannelInfo> = {
  whatsapp: {
    id: "whatsapp",
    icon: "💬",
    title: "וואטסאפ",
    description: "קליטת משימות מקבוצת וואטסאפ קיימת, שאלות למערכת בקבוצה, ותזכורות.",
    platforms: "וואטסאפ",
    limits: [
      { label: "סוגי הודעות", value: "טקסט, קול, תמונה" },
      { label: "תמלול קולי", value: `עד ${FREE_TIER_DEFAULTS.audioMinutesPerMonth} דק׳/חודש (חינמי)` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "איפוס מכסה", value: `כל ${FREE_TIER_DEFAULTS.periodDays} יום` },
    ],
    notes: [
      "שאלה למערכת מתחילה ב-בבי, למשל «בבי מה המשימות לשבוע הבא». משימה או הערה — בלי בבי, למשל «תכניס משימה יום רביעי שבוע הבא». בהקלדה אפשר גם * או ?.",
    ],
  },
  voice: {
    id: "voice",
    icon: "🎙",
    title: "הקלטה קולית",
    description: "הקלט רעיונות ומשימות ישירות מהאפליקציה או מהדפדפן — מתומללים ומסווגים אוטומטית.",
    platforms: "מובייל ודפדפן (כולל אנדרואיד) — קליטה מהירה",
    limits: [
      { label: "זמינות", value: "מובייל ודפדפן (Chrome/Android)" },
      { label: "הרשאה", value: "גישה למיקרופון" },
      { label: "פורמט", value: "M4A / WebM" },
      { label: "גודל העלאה", value: `עד ${TECH_LIMITS.voiceApiMaxMb} MB לבקשה` },
      { label: "אחסון", value: `עד ${TECH_LIMITS.storageMaxMb} MB לקובץ בשרת` },
      { label: "תמלול", value: `עד ${FREE_TIER_DEFAULTS.audioMinutesPerMonth} דק׳/חודש (חינמי)` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "שפה", value: "עברית (Whisper)" },
    ],
    notes: [
      "כל הקלטה צורכת מכסת תמלול לפי משך ההקלטה, ומכסת AI לפי אורך הטקסט.",
      "ההקלטה המקורית נשמרת וניתן להאזין לה מפרטי הפריט.",
    ],
  },
  notebook: {
    id: "notebook",
    icon: "📷",
    title: "סריקת מחברת",
    description: "סריקה פעילה: צלמו דף מחברת, פתק או מסמך — הטקסט נכנס כהערה או משימה, ובוואטסאפ מגיע גם אישור.",
    platforms: "מובייל, דפדפן (מצלמה) או וואטסאפ (תמונה)",
    limits: [
      { label: "סטטוס", value: "פעיל (כתב דפוס וכתב יד)" },
      { label: "קלט", value: "תמונת JPEG/PNG/WebP — דף, פתק או מסמך מצולם" },
      { label: "מגבלת טקסט", value: "עד כ־1,500 מילים לתמונה (עמוד אחד)" },
      { label: "גודל העלאה", value: `עד ${TECH_LIMITS.ocrApiMaxMb} MB לבקשה` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "איפוס מכסה", value: `כל ${FREE_TIER_DEFAULTS.periodDays} יום` },
    ],
    notes: [
      "צלמו עמוד אחד בכל פעם. PDF עדיין לא נתמך — שלחו כתמונה.",
      "הפרסור מפצל אוטומטית למשימות ולהערות. בוואטסאפ מגיעה הודעת אישור אחרי הסריקה.",
    ],
  },
  text: {
    id: "text",
    icon: "✏️",
    title: "קליטת טקסט",
    description: "הדבק או הקלד טקסט, רשימה או רעיון — ה-AI מפרק למשימות והערות.",
    platforms: "Web + מובייל (קליטה מהירה)",
    limits: [
      { label: "אורך מינימלי", value: `${TECH_LIMITS.minTextChars} תווים` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "חישוב מכסה", value: "לפי אורך הטקסט (~4 תווים ליחידה)" },
      { label: "איפוס מכסה", value: `כל ${FREE_TIER_DEFAULTS.periodDays} יום` },
    ],
    notes: ["שורת טקסט אחת יכולה להכיל מספר משימות/הערות — כל אחת תיווצר כפריט נפרד."],
  },
};

export function formatAudioUsage(summary: UsageSummary): string {
  if (summary.isPremium) return "ללא הגבלה (Premium)";
  const usedMin = Math.ceil(summary.audio.used / 60);
  const allocMin = Math.ceil(summary.audio.allocated / 60);
  return `${usedMin}/${allocMin} דק׳`;
}

export function formatAiUsage(summary: UsageSummary): string {
  if (summary.isPremium) return "ללא הגבלה (Premium)";
  return `${summary.aiParses.used}/${summary.aiParses.allocated}`;
}
