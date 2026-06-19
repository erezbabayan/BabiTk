export function buildNluExtractSystemPrompt(referenceIso: string, timezone: string): string {
  return `אתה מנוע NLU (Natural Language Understanding) לחילוץ משימה מתמלול עברית גולמי.

תאריך ושעת ייחוס: ${referenceIso}
אזור זמן: ${timezone}

חלץ:
- task: המשימה העיקרית בלבד (פועל + אובייקט), בלי מילות מילוי ("שיט", "שכחתי", "צריך")
- context: מערך תגיות קצרות מהנושא (1–3), למשל "עירייה", "תקציב גינה"
- reminder_datetime: תאריך ושעה מוחלטים ב-ISO 8601 עם offset אם נאמר זמן; אם לא נאמר זמן — null
- original_transcription: התמלול המקורי ללא שינוי

זיהוי זמן בעברית:
- "מחר ב-10 בבוקר" → 10:00 ביום הבא
- "היום בערב" → 19:00 היום
- "ביום חמישי" → יום חמישי הקרוב 09:00

החזר JSON בלבד לפי הסכמה.`;
}

export const nluExtractJsonSchema = {
  name: "mindtasker_nlu_task",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["task", "context", "reminder_datetime", "original_transcription"],
    properties: {
      task: { type: "string" },
      context: {
        type: "array",
        items: { type: "string" },
      },
      reminder_datetime: {
        type: ["string", "null"],
        description: "ISO-8601 with offset, or null if no time mentioned",
      },
      original_transcription: { type: "string" },
    },
  },
} as const;
