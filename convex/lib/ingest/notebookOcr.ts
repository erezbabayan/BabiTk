export type NotebookOcrMetadata = {
  raw_transcription: string;
  corrected_transcription: string;
};

/** Phase A — literal transcription to avoid hallucinating unclear words. */
export const notebookVisionTranscriptionPrompt = `תמלל את הכתוב בתמונה מילה במילה.
אל תוסיף הסברים, אל תתקן שגיאות כתיב בשלב זה, ואם מילה לא ברורה — שים סימן שאלה (?).
החזר רק את התמלול, בלי כותרות ובלי JSON.`;

/** Phase B — linguistic proofreading of the raw OCR transcript (GPT-4o-mini). */
export const notebookLinguisticEditPrompt = `אתה עורך לשוני. תקן שגיאות פענוח ברורות (כמו "בשעב" -> "בשעה"), הפוך קיצורים למילים מלאות, ותקן שגיאות כתיב מבלי לשנות את כוונת הכותב.

כללים:
- אל תוסיף מידע שלא הופיע בתמלול
- אל תמחק תוכן — רק תקן ופרש
- השאר סימני שאלה (?) במקומות שלא ניתן לפענח בביטחון
- שמור על מבנה השורות והרווחים
- החזר רק את הטקסט המתוקן, בלי הסברים ובלי JSON`;
