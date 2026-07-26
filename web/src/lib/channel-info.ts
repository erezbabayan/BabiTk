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
  ocrApiMaxMb: 2,
  storageMaxMb: 10,
  minTextChars: 3,
  phoneCodeTtlMinutes: 10,
} as const;

export const CHANNELS: Record<string, ChannelInfo> = {
  whatsapp: {
    id: "whatsapp",
    icon: "💬",
    title: "וואטסאפ",
    description: "קליטת משימות מקבוצת וואטסאפ קיימת ותזכורות יומיות.",
    platforms: "וואטסאפ",
    limits: [
      { label: "סוגי הודעות", value: "טקסט, קול, תמונה" },
      { label: "תמלול קולי", value: `עד ${FREE_TIER_DEFAULTS.audioMinutesPerMonth} דק׳/חודש (חינמי)` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "איפוס מכסה", value: `כל ${FREE_TIER_DEFAULTS.periodDays} יום` },
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
    description: "צלם דף מחברת או פתק — OCR מחלץ טקסט ויוצר משימות והערות.",
    platforms: "מובייל, דפדפן (מצלמה) או וואטסאפ (תמונה)",
    limits: [
      { label: "קלט", value: "תמונת JPEG/PNG/WebP" },
      { label: "גודל העלאה", value: `עד ${TECH_LIMITS.ocrApiMaxMb} MB לבקשה` },
      { label: "אחסון", value: `עד ${TECH_LIMITS.storageMaxMb} MB לקובץ` },
      { label: "עיבוד AI", value: `עד ${FREE_TIER_DEFAULTS.aiParsesPerMonth} פעולות/חודש (חינמי)` },
      { label: "איפוס מכסה", value: `כל ${FREE_TIER_DEFAULTS.periodDays} יום` },
    ],
    notes: [
      "התמונה מוקטנת לפני שליחה ל-Vision API לחיסכון בעלות.",
      "שורות מודגשות מוצגות כשזיהוי OCR מצליח.",
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
