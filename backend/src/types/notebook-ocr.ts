import { z } from "zod";

export const ocrBBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const ocrLineSchema = z.object({
  text: z.string(),
  completed: z.boolean(),
  bbox: ocrBBoxSchema,
});

export const notebookOcrResponseSchema = z.object({
  lines: z.array(ocrLineSchema).min(1),
});

export type OcrLine = z.infer<typeof ocrLineSchema>;
export type NotebookOcrMetadata = {
  /** Phase A: verbatim vision transcription (no spelling fixes). */
  raw_transcription: string;
  /** Phase B: linguistically corrected text for parsing. */
  corrected_transcription: string;
  /** Future: structured lines with bbox/completion from the image. */
  ocr_lines?: OcrLine[];
};

/** Phase A — literal transcription to avoid hallucinating unclear words. */
export const notebookVisionTranscriptionPrompt = `תמלל את הכתוב בתמונה מילה במילה.
אל תוסיף הסברים, אל תתקן שגיאות כתיב בשלב זה, ואם מילה לא ברורה — שים סימן שאלה (?).
החזר רק את התמלול, בלי כותרות ובלי JSON.`;

/**
 * Proofread Hebrew from any capture channel (typed, WhatsApp, voice ASR, OCR).
 * Keep in sync with convex/lib/ingest/notebookOcr.ts
 */
export const inboundHebrewProofreadPrompt = `אתה עורך לשוני לעברית מודרנית. תקן את הטקסט כך שיהיה כתוב נכון, ברור וקריא — בלי לשנות את כוונת הכותב.

הקלט יכול להגיע מהקלדה, וואטסאפ, תמלול קולי (ASR) או OCR. תקן:
1. שגיאות כתיב של מילים נפוצות
2. שגיאות תמלול קולי ברורות (הומופונים / מילים קרובות בצליל שנכתבו לא נכון)
3. **שמות פרטיים בעברית** — כתוב בכתיב הסטנדרטי של השם המיועד לפי ההקשר והצליל. דוגמאות תמלול נפוצות:
   - "רואי" → "רועי" (שם פרטי; לא "רואי")
   - "גיי" → "גיא"
   - "אידו" → "עידו", "אידן" → "עידן"
   אם ברור שזה שם אדם (אחרי ל/עם/של/אל/אצל וכו') — בחר את הכתיב העברי הנפוץ והנכון של אותו שם, לא את הכתיב השגוי מה־ASR
4. שגיאות פענוח OCR ברורות (למשל "בשעב" → "בשעה")
5. רווחים חסרים או מיותרים בין מילים
6. קיצורים נפוצים למילים מלאות כשברור מה הכוונה (למשל "בבקשה", "תזכורת")

כללים קשיחים:
- אל תוסיף מידע, משימות או פרטים שלא הופיעו בקלט
- אל תמחק תוכן משמעותי — רק תקן ניסוח/כתיב
- אל תחליף אדם באדם אחר — רק תקן כתיב של אותו שם
- אל תתרגם לאנגלית; השאר קודים, מספרי טלפון, URL ומייל כמו שהם
- שמור על מבנה השורות אם יש כמה שורות
- אם מילה לא ברורה — השאר כפי שהיא (או עם ? אם כבר היה)
- החזר רק את הטקסט המתוקן, בלי הסברים, בלי מרכאות ובלי JSON`;

/** @deprecated Prefer inboundHebrewProofreadPrompt — kept as alias for OCR callers. */
export const notebookLinguisticEditPrompt = inboundHebrewProofreadPrompt;

export const notebookOcrJsonSchema = {
  name: "mindtasker_notebook_ocr",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["lines"],
    properties: {
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "completed", "bbox"],
          properties: {
            text: { type: "string" },
            completed: { type: "boolean" },
            bbox: {
              type: "object",
              additionalProperties: false,
              required: ["left", "top", "width", "height"],
              properties: {
                left: { type: "number" },
                top: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Structure extraction (bbox, checkmarks) — optional future step on the image. */
export const notebookOcrStructurePrompt = `Extract handwritten/printed text from this notebook page.

Return JSON with a "lines" array. Each line must include:
- text: the line content (Hebrew/English)
- completed: true if marked done (checkmark/x), false if open checkbox or no mark
- bbox: bounding box as fractions of image size (0.0 to 1.0): left, top, width, height

Rules:
- One entry per visible line of writing
- Do not invent text
- bbox should tightly wrap each line of text
- Support mixed Hebrew and English`;
