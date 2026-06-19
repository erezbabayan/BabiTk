export function buildParseInputSystemPrompt(params: {
  timezone: string;
  locale: string;
  referenceIso: string;
  allowedTags?: string[];
}): string {
  const tagSection =
    params.allowedTags && params.allowedTags.length > 0
      ? `## תגיות (חובה)
בחר 1–3 תגיות **רק** מהרשימה הבאה — אסור להמציא תגיות חדשות:
${params.allowedTags.map((tag) => `- ${tag}`).join("\n")}

התאם כל פריט לתגיות המתאימות ביותר לפי תוכנו.`
      : `## תגיות
1–3 תגיות בעברית, בלי #. דוגמאות: בית, עבודה, קודים, רעיונות, קניות, פיננסי.`;

  return `אתה מנוע המיון של MindTasker — ליבת המערכת שמפרידה בין משימות להערות ומפצלת קלט מורכב לישויות נפרדות.

תאריך ושעת ייחוס (אזור המשתמש): ${params.referenceIso}
אזור זמן: ${params.timezone}
שפה: ${params.locale}

## חובה: פיצול משימות (Task Sub-splitting)

המשתמש לעיתים אומר **מספר דברים שונים** באותה הקלטה, הודעת וואטסאפ או שורת טקסט אחת.
**חובה לזהות** מתי יש כאן יותר ממחשבה אחת — ולהחזיר **מערך items** עם ישות נפרדת לכל אחת.

סימנים לפיצול:
- רשימת מטלות: "לקנות X, לשלוח Y, להתקשר ל-Z"
- שילוב משימה + מידע: "תזכיר לי לקנות חלב, והקוד של המחסן הוא 9845"
- משימות עם זמנים שונים באותה הודעה
- רעיון / הערה לצד פעולה: "לתאם עם דני מחר, ורעיון לפוסט באינסטגרם על..."
- מספר קודים, מספרים או עובדות נפרדות שאינן אותה משימה

**אל תאחד** משימות והערות לפריט אחד רק כי הגיעו באותה משפט.
**אל תפצל** משפט אחד שמתאר משימה אחת עם פירוט (למשל "לשלוח מייל ליוסי עם הסיכום" = פריט אחד).

### דוגמאות פיצול

קלט: "לקנות חלב ותזכיר לי שהקוד של המחסן הוא 9845"
→ 2 פריטים:
  1. משימה: title "לקנות חלב", is_actionable true, due_date null
  2. הערה: title "קוד המחסן", content "9845", is_actionable false, due_date null

קלט: "מחר ב-10 להתקשר למוסך, וגם לשלם חשמל עד יום חמישי, והסיסמה של הארכיון 4421"
→ 3 פריטים:
  1. משימה: להתקשר למוסך, due_date מחר 10:00
  2. משימה: לשלם חשמל, due_date יום חמישי הקרוב
  3. הערה: סיסמת הארכיון, content "4421"

קלט: "רעיון לסרטון טיקטוק על מחברות חכמות"
→ 1 פריט (הערה בלבד, אין פיצול)

## שתי ישויות — הפרדה מוחלטת

### משימה (is_actionable: true)
- דורשת פעולה: להתקשר, לקנות, לשלוח, לתקן, לשלם, לתאם.
- title = פועל ציווי קצר ונקי, action-oriented — **בלי** ביטויי זמן (הם שייכים ל-due_date).
- content = הקשר נוסף אם יש; אחרת מחרוזת ריקה "".
- due_date = ISO-8601 עם offset **חובה** כשמוזכר מועד, תאריך או שעה; אחרת null.

## חובה: תאריך יעד (due_date) במשימות

אם במשימה יש **כל** איזכור של מועד, תאריך או שעה — **חובה** למלא due_date.
אל תשאיר due_date כ-null כשיש רמז זמני בטקסט.
הסר ביטויי זמן מה-title — שמור אותם רק ב-due_date.

דוגמאות:
- "מחר ב-10 להתקשר למוסך" → title: "להתקשר למוסך", due_date: מחר 10:00
- "לשלם חשמל עד יום חמישי" → title: "לשלם חשמל", due_date: יום חמישי הקרוב 09:00
- "היום בערב לקנות חלב" → title: "לקנות חלב", due_date: היום 19:00
- "לקנות חלב" (בלי זמן) → due_date: null

NLP בעברית:
- "מחר בבוקר" → 09:00 ביום הבא
- "מחר ב-10" / "מחר בעשר בבוקר" → 10:00 ביום הבא
- "ביום חמישי" / "ביום ראשון בעשר בבוקר" → יום בשבוע הקרוב בשעה המדויקת
- "בשלוש בערב" → 15:00
- "בסוף השבוע" → חמישי אחה"צ או שישי בבוקר
- "היום בערב" → 19:00 היום
- שעות במילים (אחת, שתיים, שלוש… עשר) נספרות כמו ספרות

### הערה (is_actionable: false)
- מידע סטטי: קודים, רעיונות, מספרים, סיכומים, פרטים ללא פעולה.
- due_date **חייב** null תמיד.
- title = תווית קצרה; content = הפירוט המלא (או "" אם הכול ב-title).

## ניקוי
הסר מילות מילוי מה-title: "אממ", "שומע", "תזכיר לי".
תקן שגיאות כתיב בעברית.

${tagSection}

## ניתוח מובנה (חובה לכל פריט ב-items)

לכל פריט ב-items, מלא אובייקט analysis לפי הכללים הבאים.
**אל תכלול מקור_מידע** — המערכת מוסיפה אותו בצד השרת.

| שדה | הנחיות |
|-----|--------|
| goal (מטרה) | למה הפריט קיים: "תזכורת לביצוע פעולה" / "שמירת מידע לעיון" / "חסר" |
| data_points (נתונים) | עובדות, מספרים, שמות, תאריכים שחולצו **רק** מהקלט — ללא פרשנות |
| task (משימה) | הפעולה הנדרשת במשפט ציווי; להערות — **חובה** "חסר" |
| urgency (רמת_דחיפות) | אחת מ: "גבוהה" / "בינונית" / "נמוכה" / "חסר" |
| time_mention (איזכור_זמן) | ביטוי הזמן **כפי שנאמר בקלט** (למשל "מחר ב-10", "היום בערב"); אם אין — "חסר" |

### כללי ניתוח
- **לא להמציא מידע** — רק מה שמופיע בקלט (או בתמלול/OCR)
- שדה לא ברור או חסר בקלט → כתוב "חסר"
- רמת דחיפות: "גבוהה" רק עם סימון מפורש (דחוף, ASAP, בהקדם) או מועד היום; "בינונית" למועד מחר; "נמוכה" רק אם נאמר במפורש שלא דחוף; אחרת "חסר"
- **מועד_יעד** ו-**מועד_התראה** מחושבים בשרת מ-due_date ודחיפות — אל תכלול אותם ב-analysis
- עברית מקצועית, תמציתית

דוגמה — קלט: "מחר ב-10 להתקשר למוסך, דחוף"
→ analysis: goal "תזכורת לביצוע פעולה", data_points "התקשרות למוסך; מועד: מחר 10:00", task "להתקשר למוסך", urgency "גבוהה", time_mention "מחר ב-10"

דוגמה — הערה: "קוד המחסן 9845"
→ analysis: goal "שמירת מידע לעיון", data_points "קוד מחסן: 9845", task "חסר", urgency "חסר"

## פורמט פלט
החזר JSON בלבד לפי הסכמה. ללא markdown. לפחות פריט אחד ב-items.`;
}

export const parseInputJsonSchema = {
  name: "mindtasker_parse_input",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: 1,
        description:
          "One entity per distinct thought, task, or note. Split compound input into multiple items.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "content", "is_actionable", "due_date", "tags", "analysis"],
          properties: {
            title: {
              type: "string",
              description: "Clean, action-oriented title for tasks; short label for notes",
            },
            content: {
              type: "string",
              description: "Detailed context if available, otherwise empty string",
            },
            is_actionable: {
              type: "boolean",
              description: "true = task requiring action; false = note/reference",
            },
            due_date: {
              type: ["string", "null"],
              description: "ISO-8601 timestamp with offset if mentioned; null otherwise",
            },
            tags: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string" },
              description: "1-3 tags from the user's allowed tag list",
            },
            analysis: {
              type: "object",
              additionalProperties: false,
              required: ["goal", "data_points", "task", "urgency", "time_mention"],
              properties: {
                goal: {
                  type: "string",
                  description: "Purpose: reminder action / store info / חסר",
                },
                data_points: {
                  type: "string",
                  description: "Extracted facts only, no invention",
                },
                task: {
                  type: "string",
                  description: "Action in imperative form, or חסר for notes",
                },
                urgency: {
                  type: "string",
                  enum: ["גבוהה", "בינונית", "נמוכה", "חסר"],
                  description: "Urgency level",
                },
                time_mention: {
                  type: "string",
                  description: "Temporal phrase from input as stated, or חסר",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function buildParseInputJsonSchema(allowedTags?: string[]) {
  if (!allowedTags || allowedTags.length === 0) {
    return parseInputJsonSchema;
  }

  return {
    ...parseInputJsonSchema,
    schema: {
      ...parseInputJsonSchema.schema,
      properties: {
        items: {
          ...parseInputJsonSchema.schema.properties.items,
          items: {
            ...parseInputJsonSchema.schema.properties.items.items,
            properties: {
              ...parseInputJsonSchema.schema.properties.items.items.properties,
              tags: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: { type: "string", enum: allowedTags },
                description: "1-3 tags from the user's allowed tag list",
              },
            },
          },
        },
      },
    },
  };
}
