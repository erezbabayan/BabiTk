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

/** Phase B — linguistic proofreading of the raw OCR transcript. */
export const notebookLinguisticEditPrompt = `אתה עורך לשוני. תקן שגיאות פענוח ברורות (כמו "בשעב" -> "בשעה"), הפוך קיצורים למילים מלאות, ותקן שגיאות כתיב מבלי לשנות את כוונת הכותב.

כללים:
- אל תוסיף מידע שלא הופיע בתמלול
- אל תמחק תוכן — רק תקן ופרש
- השאר סימני שאלה (?) במקומות שלא ניתן לפענח בביטחון
- שמור על מבנה השורות והרווחים
- החזר רק את הטקסט המתוקן, בלי הסברים ובלי JSON`;

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
