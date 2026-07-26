/**
 * Shared linguistic prompts for OCR / ASR / typed Hebrew proofreading.
 * Keep in sync with backend/src/types/notebook-ocr.ts (prompt strings).
 */

export type NotebookOcrMetadata = {
  raw_transcription: string;
  corrected_transcription: string;
};

/** Phase A — literal transcription to avoid hallucinating unclear words. */
export const notebookVisionTranscriptionPrompt = `תמלל את כל הטקסט הנראה בתמונה מילה במילה.
זה יכול להיות מחברת בכתב יד, צילום מסך, רשימת משימות, פתק, לוח, או צ'ק־ליסט.
כל שורה / נקודה / סעיף ממוספר = שורה נפרדת בפלט (שורה חדשה בין פריטים).
אל תוסיף הסברים, אל תתקן שגיאות כתיב בשלב זה, ואם מילה לא ברורה — שים סימן שאלה (?).
אם אין טקסט קריא בכלל — החזר מחרוזת ריקה.
החזר רק את התמלול, בלי כותרות ובלי JSON.`;

/**
 * Proofread Hebrew from any capture channel (typed, WhatsApp, voice ASR, OCR).
 * Used before NLU/parse so titles and content are spelled correctly.
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
